import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { Worker, type Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { ticketMessages, tickets, type Database } from '@foxindex/database';
import { createQueue } from '@foxindex/queue';
import type { SupportSettings } from '@foxindex/validation';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { NotificationsService } from '../notifications/notifications.service';
import { SupportSettingsService } from './support-settings.service';
import { ACTIVE_STATUSES, OPEN_STATUSES, TicketsService } from './tickets.service';

const QUEUE = 'ticket-automation';
const BATCH = 200;
type TicketRow = typeof tickets.$inferSelect;

export function humanMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round((m / 60) * 10) / 10} h`.replace('.0 h', ' h');
  return `${Math.round(m / 1440)} days`;
}

export interface AutomationRun {
  firstResponseWarned: number;
  resolutionWarned: number;
  firstResponseBreached: number;
  resolutionBreached: number;
  reminded: number;
  autoResolved: number;
  autoClosed: number;
}

/**
 * The support team's robot: SLA warnings and breach escalations, "still need
 * help?" reminders, auto-resolve after silence and auto-close after resolve.
 * Runs every minute via a BullMQ job scheduler (one execution cluster-wide).
 * Each step is a single UPDATE … RETURNING guarded by its flag column, so a
 * retried or overlapping run can never notify twice.
 */
@Injectable()
export class TicketAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketAutomationService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(SupportSettingsService) private readonly settings: SupportSettingsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(TicketsService) private readonly ticketsService: TicketsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || process.env.TICKET_AUTOMATION === 'off') return;
    this.queue = createQueue(QUEUE, this.redis);
    await this.queue.upsertJobScheduler('tick', { every: 60_000 }, { name: 'tick', opts: { removeOnComplete: 50, removeOnFail: 100 } });
    this.worker = new Worker(QUEUE, async () => this.run(), { connection: this.redis, concurrency: 1 });
    this.worker.on('failed', (_job, error) => this.logger.warn(`ticket automation failed: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** One pass of every rule. Exposed for the "Run now" button and tests. */
  async run(): Promise<AutomationRun> {
    const s = await this.settings.get();
    const adminIds = s.automation.escalateBreachesToAdmins ? await this.ticketsService.adminIds() : [];
    const result: AutomationRun = {
      firstResponseWarned: (await this.warn('first_response', s)).length,
      resolutionWarned: (await this.warn('resolution', s)).length,
      firstResponseBreached: (await this.breach('first_response', adminIds)).length,
      resolutionBreached: (await this.breach('resolution', adminIds)).length,
      reminded: (await this.remind(s)).length,
      autoResolved: (await this.autoResolve(s)).length,
      autoClosed: (await this.autoClose(s)).length,
    };
    if (Object.values(result).some(Boolean)) this.logger.log(`ticket automation ${JSON.stringify(result)}`);
    return result;
  }

  /** Atomically flag up to BATCH rows matching `where` and return them. */
  private async claim(where: SQL, set: Partial<typeof tickets.$inferInsert>): Promise<TicketRow[]> {
    const ids = this.db.select({ id: tickets.id }).from(tickets).where(where).limit(BATCH);
    return this.db.update(tickets).set(set).where(and(where, inArray(tickets.id, ids))).returning();
  }

  private async events(rows: TicketRow[], body: (t: TicketRow) => string, meta: Record<string, unknown>) {
    if (!rows.length) return;
    await this.db.insert(ticketMessages).values(rows.map((t) => ({ ticketId: t.id, senderId: null, kind: 'event', body: body(t), meta })));
  }

  private async warn(kind: 'first_response' | 'resolution', s: SupportSettings) {
    const pct = s.automation.slaWarnPercent / 100;
    const fr = kind === 'first_response';
    const due = fr ? tickets.firstResponseDueAt : tickets.resolutionDueAt;
    const where = and(
      fr ? isNull(tickets.firstResponseAt) : isNotNull(tickets.firstResponseAt),
      fr ? inArray(tickets.status, OPEN_STATUSES) : and(inArray(tickets.status, ACTIVE_STATUSES), isNull(tickets.slaPausedAt)),
      isNull(fr ? tickets.firstResponseWarnedAt : tickets.resolutionWarnedAt),
      sql`now() < ${due} AND now() >= ${tickets.createdAt} + (${due} - ${tickets.createdAt}) * ${pct}::float8`,
    )!;
    const rows = await this.claim(where, fr ? { firstResponseWarnedAt: new Date() } : { resolutionWarnedAt: new Date() });
    for (const t of rows) {
      if (!t.assignedManagerId) continue;
      const left = ((fr ? t.firstResponseDueAt! : t.resolutionDueAt!).getTime() - Date.now()) / 60_000;
      this.notifications.notify({
        userId: t.assignedManagerId,
        type: 'ticket.sla_warning',
        title: `${t.number}: ${fr ? 'first reply' : 'resolution'} due in ${humanMinutes(left)}`,
        body: `${t.subject} · ${t.priority} priority`,
        link: `/tickets?id=${t.id}`,
      });
      this.ticketsService.broadcast(t);
    }
    return rows;
  }

  private async breach(kind: 'first_response' | 'resolution', adminIds: string[]) {
    const fr = kind === 'first_response';
    const now = new Date();
    const where = and(
      fr ? isNull(tickets.firstResponseAt) : isNotNull(tickets.firstResponseAt),
      fr ? inArray(tickets.status, OPEN_STATUSES) : and(inArray(tickets.status, ACTIVE_STATUSES), isNull(tickets.slaPausedAt)),
      isNull(fr ? tickets.firstResponseBreachedAt : tickets.resolutionBreachedAt),
      lte(fr ? tickets.firstResponseDueAt : tickets.resolutionDueAt, now),
    )!;
    const rows = await this.claim(where, fr ? { firstResponseBreachedAt: now } : { resolutionBreachedAt: now });
    await this.events(rows, () => `${fr ? 'First response' : 'Resolution'} SLA breached`, { sla: kind, breached: true });
    for (const t of rows) {
      const recipients = new Set([t.assignedManagerId, ...adminIds].filter((x): x is string => Boolean(x)));
      for (const userId of recipients) {
        this.notifications.notify({
          userId,
          type: 'ticket.sla_breach',
          title: `SLA breached · ${t.number} (${t.priority})`,
          body: `${t.subject}\n\nThe ${fr ? 'first reply' : 'resolution'} target has passed${t.assignedManagerId ? '' : ' and the ticket is unassigned'}.`,
          link: `/tickets?id=${t.id}`,
        });
      }
      this.ticketsService.broadcast(t);
    }
    return rows;
  }

  private async remind(s: SupportSettings) {
    const hours = s.automation.waitingReminderHours;
    if (!hours) return [];
    // Don't nudge if auto-resolve would fire first anyway.
    if (s.automation.waitingAutoResolveHours && s.automation.waitingAutoResolveHours <= hours) return [];
    const where = and(
      eq(tickets.status, 'waiting_on_client'),
      sql`${tickets.lastMessageAt} <= now() - make_interval(hours => ${hours})`,
      or(isNull(tickets.reminderSentAt), sql`${tickets.reminderSentAt} < ${tickets.lastMessageAt}`),
    )!;
    const rows = await this.claim(where, { reminderSentAt: new Date() });
    await this.events(rows, () => 'Reminder sent to the client', { reminder: true });
    for (const t of rows) {
      const closeIn = s.automation.waitingAutoResolveHours ? ` If we don’t hear back, it will be marked resolved in about ${humanMinutes((s.automation.waitingAutoResolveHours - hours) * 60)}.` : '';
      this.notifications.notify({
        userId: t.userId,
        type: 'ticket.reminder',
        title: `Still need help with ${t.number}?`,
        body: `${t.subject}\n\nWe replied and are waiting for you.${closeIn}`,
        link: `/tickets?id=${t.id}`,
        preference: 'managerReplied',
      });
      this.ticketsService.broadcast(t);
    }
    return rows;
  }

  private async autoResolve(s: SupportSettings) {
    const hours = s.automation.waitingAutoResolveHours;
    if (!hours) return [];
    const now = new Date();
    const where = and(eq(tickets.status, 'waiting_on_client'), sql`${tickets.lastMessageAt} <= now() - make_interval(hours => ${hours})`)!;
    // Already paused while waiting, so the SLA clock needs no change.
    const rows = await this.claim(where, { status: 'resolved', resolvedAt: now, updatedAt: now, slaPausedAt: sql`coalesce(${tickets.slaPausedAt}, now())` as unknown as Date });
    await this.events(rows, () => `Automatically resolved after ${humanMinutes(hours * 60)} without a reply`, { from: 'waiting_on_client', to: 'resolved', automated: true });
    for (const t of rows) {
      this.notifications.notify({
        userId: t.userId,
        type: 'ticket.status',
        title: `${t.number} was marked resolved`,
        body: `${t.subject}\n\nWe didn’t hear back, so we closed the loop. Reply on the ticket any time to reopen it${s.csat.enabled ? ' — or rate how we did' : ''}.`,
        link: `/tickets?id=${t.id}`,
      });
      this.ticketsService.broadcast(t);
    }
    return rows;
  }

  private async autoClose(s: SupportSettings) {
    const hours = s.automation.autoCloseResolvedHours;
    if (!hours) return [];
    const now = new Date();
    const where = and(eq(tickets.status, 'resolved'), sql`${tickets.resolvedAt} <= now() - make_interval(hours => ${hours})`)!;
    const rows = await this.claim(where, { status: 'closed', closedAt: now, updatedAt: now });
    await this.events(rows, () => 'Closed automatically', { from: 'resolved', to: 'closed', automated: true });
    for (const t of rows) this.ticketsService.broadcast(t);
    return rows;
  }
}
