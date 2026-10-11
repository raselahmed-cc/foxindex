import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { sites, ticketMacros, ticketMessages, tickets, users, type Database, type Transaction } from '@foxindex/database';
import {
  CLIENT_TICKET_PRIORITIES,
  macroActionsSchema,
  type BulkUpdateTicketsInput,
  type CreateTicketInput,
  type MergeTicketInput,
  type ReplyTicketInput,
  type TicketCsatInput,
  type TicketGrantCreditsInput,
  type TicketListQuery,
  type TicketStatus,
  type TicketView,
  type UpdateTicketInput,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { ADMINS_ROOM, RealtimeService, userRoom } from '../../common/realtime/realtime.service';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreditsRepository } from '../credits/credits.repository';
import { AttachmentsService } from '../files/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { slaSummary } from './sla-clock';
import { SupportSettingsService } from './support-settings.service';
import { initialSla, reprioritiseSla, statusSla, type SlaPatch } from './ticket-sla';
import { isAdmin, isStaff, ticketScope, type TicketActor } from './ticket-scope';

export type { TicketActor } from './ticket-scope';

type TicketRow = typeof tickets.$inferSelect;

export const OPEN_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_on_client'];
export const ACTIVE_STATUSES: TicketStatus[] = ['open', 'in_progress'];
export const DONE_STATUSES: TicketStatus[] = ['resolved', 'closed'];
export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_client: 'Waiting on client',
  resolved: 'Resolved',
  closed: 'Closed',
};
const PRIORITY_RANK = sql`CASE ${tickets.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;
export const SYSTEM_SENDER = 'FoxIndex';
const assignee = alias(users, 'assignee');

/** SQL predicates mirroring `slaSummary` so list filters and badges agree. */
export const SLA_SQL = {
  breached: sql`(
    (${tickets.firstResponseAt} IS NULL AND ${tickets.firstResponseDueAt} <= now() AND ${inArray(tickets.status, OPEN_STATUSES)})
    OR (${tickets.firstResponseAt} IS NOT NULL AND ${tickets.slaPausedAt} IS NULL AND ${inArray(tickets.status, ACTIVE_STATUSES)} AND ${tickets.resolutionDueAt} <= now())
  )`,
  atRisk: (pct: number) => sql`(
    (${tickets.firstResponseAt} IS NULL AND ${inArray(tickets.status, OPEN_STATUSES)} AND now() < ${tickets.firstResponseDueAt}
      AND now() >= ${tickets.createdAt} + (${tickets.firstResponseDueAt} - ${tickets.createdAt}) * ${pct / 100}::float8)
    OR (${tickets.firstResponseAt} IS NOT NULL AND ${tickets.slaPausedAt} IS NULL AND ${inArray(tickets.status, ACTIVE_STATUSES)} AND now() < ${tickets.resolutionDueAt}
      AND now() >= ${tickets.createdAt} + (${tickets.resolutionDueAt} - ${tickets.createdAt}) * ${pct / 100}::float8)
  )`,
};

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

@Injectable()
export class TicketsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
    @Inject(SupportSettingsService) private readonly settings: SupportSettingsService,
  ) {}

  // ── Access & helpers ───────────────────────────────────────────────────

  private async load(id: string, actor: TicketActor, executor: Database | Transaction = this.db): Promise<TicketRow> {
    const [row] = await executor.select().from(tickets).where(and(eq(tickets.id, id), ticketScope(actor)));
    if (!row) throw new NotFoundError('Ticket');
    return row;
  }

  /** Throws unless a staff member may see this ticket (used for collision presence). */
  async assertStaffAccess(id: string, actor: TicketActor): Promise<TicketRow> {
    if (!isStaff(actor)) throw new AuthorizationError();
    return this.load(id, actor);
  }

  private async nextNumber(): Promise<string> {
    const r = await this.db.execute<{ n: string }>(sql`SELECT nextval('ticket_number_seq') AS n`);
    return `TKT-${r.rows[0].n}`;
  }

  /** Client, assignee and every admin get a lightweight "refetch" ping (never content). */
  broadcast(t: Pick<TicketRow, 'id' | 'userId' | 'assignedManagerId'>, extraUserIds: string[] = []) {
    const ids = [t.userId, t.assignedManagerId, ...extraUserIds].filter((x): x is string => Boolean(x));
    this.realtime.emitToRooms([...new Set(ids)].map(userRoom).concat(ADMINS_ROOM), 'ticket:updated', { id: t.id });
  }

  async adminIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, [UserRole.ADMIN, UserRole.SUPERADMIN]), eq(users.status, 'active')));
    return rows.map((r) => r.id);
  }

  /** Least-loaded active manager, preferring those marked available. */
  private async pickAssignee(): Promise<string | null> {
    const r = await this.db.execute<{ id: string }>(sql`
      SELECT u.id FROM ${users} u
      LEFT JOIN ${tickets} t ON t.assigned_manager_id = u.id AND t.status IN ('open', 'in_progress', 'waiting_on_client')
      WHERE u.role = 'manager' AND u.status = 'active'
      GROUP BY u.id, u.availability
      ORDER BY (u.availability = 'available') DESC, count(t.id) ASC, random()
      LIMIT 1`);
    return r.rows[0]?.id ?? null;
  }

  private event(ticketId: string, body: string, meta: Record<string, unknown>, senderId: string | null) {
    return { ticketId, senderId, body, kind: 'event' as const, meta };
  }

  // ── Queries ────────────────────────────────────────────────────────────

  private viewFilter(view: TicketView, actor: TicketActor, warnPct: number): SQL | undefined {
    switch (view) {
      case 'open':
        return inArray(tickets.status, OPEN_STATUSES);
      case 'mine':
        return and(inArray(tickets.status, OPEN_STATUSES), eq(tickets.assignedManagerId, actor.id));
      case 'unassigned':
        return and(inArray(tickets.status, OPEN_STATUSES), isNull(tickets.assignedManagerId));
      case 'at_risk':
        return SLA_SQL.atRisk(warnPct);
      case 'breached':
        return SLA_SQL.breached;
      case 'waiting':
        return eq(tickets.status, 'waiting_on_client');
      case 'resolved':
        return inArray(tickets.status, DONE_STATUSES);
      default:
        return undefined;
    }
  }

  private listWhere(actor: TicketActor, query: Omit<TicketListQuery, 'view' | 'sort' | 'limit' | 'offset'>) {
    const staff = isStaff(actor);
    const term = query.q ? `%${query.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    return and(
      ticketScope(actor),
      term ? or(ilike(tickets.subject, term), ilike(tickets.number, term), staff ? sql`${tickets.userId} IN (SELECT id FROM ${users} WHERE name ILIKE ${term} OR email ILIKE ${term})` : undefined) : undefined,
      query.priority ? eq(tickets.priority, query.priority) : undefined,
      query.category ? eq(tickets.category, query.category) : undefined,
      query.tag ? sql`${tickets.tags} @> ARRAY[${query.tag}]::text[]` : undefined,
      staff && query.assigneeId ? eq(tickets.assignedManagerId, query.assigneeId) : undefined,
      staff && query.clientId ? eq(tickets.userId, query.clientId) : undefined,
    );
  }

  private orderBy(sort: TicketListQuery['sort']) {
    switch (sort) {
      case 'created':
        return [desc(tickets.createdAt)];
      case 'priority':
        return [asc(PRIORITY_RANK), desc(tickets.lastMessageAt)];
      case 'due':
        return [sql`CASE WHEN ${tickets.firstResponseAt} IS NULL THEN ${tickets.firstResponseDueAt} WHEN ${tickets.slaPausedAt} IS NULL AND ${inArray(tickets.status, ACTIVE_STATUSES)} THEN ${tickets.resolutionDueAt} END ASC NULLS LAST`, desc(tickets.lastMessageAt)];
      default:
        return [desc(tickets.lastMessageAt)];
    }
  }

  async list(actor: TicketActor, query: TicketListQuery) {
    const staff = isStaff(actor);
    const settings = await this.settings.get();
    const pct = settings.automation.slaWarnPercent;
    const view: TicketView = staff || ['open', 'resolved', 'all', 'waiting'].includes(query.view) ? query.view : 'open';
    const base = this.listWhere(actor, query);

    const rows = await this.db
      .select({ ticket: tickets, clientName: users.name, clientEmail: users.email, assigneeName: assignee.name })
      .from(tickets)
      .innerJoin(users, eq(users.id, tickets.userId))
      .leftJoin(assignee, eq(assignee.id, tickets.assignedManagerId))
      .where(and(base, this.viewFilter(view, actor, pct)))
      .orderBy(...this.orderBy(query.sort))
      .limit(query.limit + 1)
      .offset(query.offset);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);

    const ids = page.map((r) => r.ticket.id);
    const previews = ids.length
      ? await this.db.execute<{ ticket_id: string; body: string; sender_name: string | null }>(sql`
          SELECT DISTINCT ON (tm.ticket_id) tm.ticket_id, tm.body, u.name AS sender_name
          FROM ${ticketMessages} tm LEFT JOIN ${users} u ON u.id = tm.sender_id
          WHERE tm.ticket_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
            AND tm.kind = 'message' ${staff ? sql`` : sql`AND tm.is_internal_note = false`}
          ORDER BY tm.ticket_id, tm.created_at DESC`)
      : { rows: [] };
    const previewBy = new Map(previews.rows.map((p) => [p.ticket_id, p]));

    const countViews: TicketView[] = staff ? ['open', 'mine', 'unassigned', 'at_risk', 'breached', 'waiting', 'resolved', 'all'] : ['open', 'waiting', 'resolved', 'all'];
    const [countRow] = await this.db
      .select(Object.fromEntries(countViews.map((v) => [v, sql<string>`count(*) FILTER (WHERE ${this.viewFilter(v, actor, pct) ?? sql`true`})`])))
      .from(tickets)
      .where(base);

    const now = new Date();
    return {
      counts: Object.fromEntries(countViews.map((v) => [v, Number(countRow?.[v] ?? 0)])) as Record<TicketView, number>,
      hasMore,
      items: page.map(({ ticket: t, clientName, clientEmail, assigneeName }) => {
        const readAt = staff ? t.staffReadAt : t.clientReadAt;
        const p = previewBy.get(t.id);
        const sla = staff ? slaSummary(t, now, pct) : null;
        return {
          id: t.id,
          number: t.number,
          subject: t.subject,
          category: t.category,
          priority: t.priority,
          status: t.status,
          tags: t.tags,
          lastMessageAt: t.lastMessageAt,
          createdAt: t.createdAt,
          unread: t.lastSenderId !== null && t.lastSenderId !== actor.id && (!readAt || readAt < t.lastMessageAt),
          preview: p ? { body: p.body.slice(0, 160), senderName: p.sender_name ?? SYSTEM_SENDER } : null,
          ...(staff
            ? {
                client: { id: t.userId, name: clientName, email: clientEmail },
                assignee: t.assignedManagerId ? { id: t.assignedManagerId, name: assigneeName ?? '' } : null,
                sla,
                csatRating: t.csatRating,
              }
            : {}),
        };
      }),
    };
  }

  async get(id: string, actor: TicketActor) {
    const t = await this.load(id, actor);
    const staff = isStaff(actor);
    const settings = await this.settings.get();

    const [client, manager, site, mergedInto, related] = await Promise.all([
      this.db.query.users.findFirst({ where: eq(users.id, t.userId), columns: { id: true, name: true, email: true, creditBalanceCached: true, whatsapp: true, company: true, createdAt: true } }),
      t.assignedManagerId ? this.db.query.users.findFirst({ where: eq(users.id, t.assignedManagerId), columns: { id: true, name: true } }) : null,
      t.siteId ? this.db.query.sites.findFirst({ where: eq(sites.id, t.siteId), columns: { id: true, domain: true } }) : null,
      t.mergedIntoId ? this.db.query.tickets.findFirst({ where: eq(tickets.id, t.mergedIntoId), columns: { id: true, number: true } }) : null,
      staff
        ? this.db
            .select({ id: tickets.id, number: tickets.number, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt })
            .from(tickets)
            .where(and(eq(tickets.userId, t.userId), sql`${tickets.id} <> ${t.id}`))
            .orderBy(desc(tickets.createdAt))
            .limit(6)
        : [],
    ]);

    const rows = await this.db
      .select({ m: ticketMessages, senderName: users.name, senderRole: users.role })
      .from(ticketMessages)
      .leftJoin(users, eq(users.id, ticketMessages.senderId))
      .where(and(eq(ticketMessages.ticketId, t.id), staff ? undefined : eq(ticketMessages.isInternalNote, false)))
      .orderBy(ticketMessages.createdAt);
    const files = await this.attachments.forOwners('ticket_message', rows.map((r) => r.m.id));

    await this.db
      .update(tickets)
      .set(staff ? { staffReadAt: new Date() } : { clientReadAt: new Date() })
      .where(eq(tickets.id, t.id));

    const now = new Date();
    const sla = slaSummary(t, now, settings.automation.slaWarnPercent);
    return {
      id: t.id,
      number: t.number,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      source: t.source,
      tags: staff ? t.tags : [],
      createdAt: t.createdAt,
      firstResponseAt: t.firstResponseAt,
      resolvedAt: t.resolvedAt,
      conversationId: t.conversationId,
      mergedInto,
      site,
      manager,
      csat: t.csatRating ? { rating: t.csatRating, comment: t.csatComment, at: t.csatAt } : null,
      csatEnabled: settings.csat.enabled,
      ...(staff
        ? {
            sla: {
              current: sla,
              firstResponseDueAt: t.firstResponseDueAt,
              resolutionDueAt: t.resolutionDueAt,
              paused: Boolean(t.slaPausedAt),
              firstResponseBreached: Boolean(t.firstResponseDueAt && (t.firstResponseAt ?? now) > t.firstResponseDueAt),
              resolutionBreached: Boolean(t.resolutionBreachedAt),
            },
            related,
          }
        : {
            // Clients see a promise, never a countdown or a breach.
            expectedReplyBy: !t.firstResponseAt && t.firstResponseDueAt && t.firstResponseDueAt > now ? t.firstResponseDueAt : null,
          }),
      client: staff ? client : { id: client?.id, name: client?.name },
      messages: rows.map(({ m, senderName, senderRole }) => ({
        id: m.id,
        kind: m.kind as 'message' | 'event',
        body: m.body,
        internal: m.isInternalNote,
        senderId: m.senderId,
        senderName: senderName ?? SYSTEM_SENDER,
        senderRole: senderRole ?? 'system',
        createdAt: m.createdAt,
        meta: m.meta,
        attachments: files.get(m.id) ?? [],
      })),
    };
  }

  /** Distinct tags in the actor's scope with usage counts — powers filter + autocomplete. */
  async tags(actor: TicketActor) {
    if (!isStaff(actor)) return [];
    const r = await this.db.execute<{ tag: string; n: string }>(sql`
      SELECT tag, count(*) AS n FROM ${tickets}, unnest(${tickets.tags}) AS tag
      WHERE ${ticketScope(actor) ?? sql`true`}
      GROUP BY tag ORDER BY count(*) DESC, tag LIMIT 50`);
    return r.rows.map((x) => ({ tag: x.tag, count: Number(x.n) }));
  }

  /** CSV of the filtered list (max 10,000 rows), formula-injection safe. */
  async exportCsv(actor: TicketActor, query: TicketListQuery): Promise<string> {
    if (!isStaff(actor)) throw new AuthorizationError();
    const settings = await this.settings.get();
    const rows = await this.db
      .select({ t: tickets, clientName: users.name, clientEmail: users.email, assigneeName: assignee.name })
      .from(tickets)
      .innerJoin(users, eq(users.id, tickets.userId))
      .leftJoin(assignee, eq(assignee.id, tickets.assignedManagerId))
      .where(and(this.listWhere(actor, query), this.viewFilter(query.view, actor, settings.automation.slaWarnPercent)))
      .orderBy(...this.orderBy(query.sort))
      .limit(10_000);
    const header = ['Number', 'Subject', 'Status', 'Priority', 'Category', 'Tags', 'Client', 'Client email', 'Assignee', 'Source', 'Created', 'First response', 'First response due', 'First response breached', 'Resolved', 'Resolution due', 'Resolution breached', 'CSAT', 'CSAT comment'];
    const lines = rows.map(({ t, clientName, clientEmail, assigneeName }) =>
      [
        t.number,
        t.subject,
        STATUS_LABEL[t.status],
        t.priority,
        t.category,
        t.tags.join('; '),
        clientName,
        clientEmail,
        assigneeName ?? '',
        t.source,
        t.createdAt,
        t.firstResponseAt,
        t.firstResponseDueAt,
        t.firstResponseDueAt ? ((t.firstResponseAt ?? new Date()) > t.firstResponseDueAt ? 'yes' : 'no') : '',
        t.resolvedAt,
        t.resolutionDueAt,
        t.resolutionBreachedAt ? 'yes' : 'no',
        t.csatRating ?? '',
        t.csatComment ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.map(csvCell).join(','), ...lines].join('\r\n');
  }

  // ── Creation ───────────────────────────────────────────────────────────

  async create(actor: TicketActor, input: CreateTicketInput) {
    const staff = isStaff(actor);
    const clientId = staff ? input.clientId : actor.id;
    if (!clientId) throw new ValidationError('Choose the client this ticket is for', { reason: 'CLIENT_REQUIRED' });
    if (!staff && !(CLIENT_TICKET_PRIORITIES as readonly string[]).includes(input.priority)) throw new ValidationError('Choose low, normal or high priority');

    const client = await this.db.query.users.findFirst({ where: and(eq(users.id, clientId), eq(users.role, UserRole.CLIENT)), columns: { id: true, name: true, assignedManagerId: true } });
    if (!client) throw new NotFoundError('Client');
    if (actor.role === UserRole.MANAGER && client.assignedManagerId !== actor.id) throw new AuthorizationError('That client is not assigned to you');
    if (input.siteId) {
      const site = await this.db.query.sites.findFirst({ where: and(eq(sites.id, input.siteId), eq(sites.userId, clientId)) });
      if (!site) throw new ValidationError('That site is not on this account');
    }

    const settings = await this.settings.get();
    let assignedManagerId = client.assignedManagerId ?? (actor.role === UserRole.MANAGER ? actor.id : null);
    if (!assignedManagerId && settings.automation.autoAssign) assignedManagerId = await this.pickAssignee();

    const number = await this.nextNumber();
    const now = new Date();
    const sla = initialSla(input.priority, now, settings);

    const ticket = await this.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tickets)
        .values({
          number,
          userId: clientId,
          assignedManagerId,
          subject: input.subject,
          category: input.category,
          priority: input.priority,
          siteId: input.siteId ?? null,
          tags: staff ? (input.tags ?? []) : [],
          source: staff ? 'staff' : 'web',
          lastSenderId: actor.id,
          ...sla,
          // Staff outreach counts as the first response and starts on the client.
          ...(staff ? { status: 'waiting_on_client' as const, firstResponseAt: now, slaPausedAt: now, staffReadAt: now } : { clientReadAt: now }),
        })
        .returning();
      const [msg] = await tx.insert(ticketMessages).values({ ticketId: t.id, senderId: actor.id, body: input.body }).returning();
      await this.attachments.link(tx, actor.id, input.attachmentIds, 'ticket_message', msg.id);
      if (!client.assignedManagerId && assignedManagerId && !staff) {
        await tx.insert(ticketMessages).values(this.event(t.id, 'Automatically assigned', { autoAssigned: assignedManagerId }, null));
      }
      await this.auditLog.record({ actorId: actor.id, action: staff ? 'ticket.create_for_client' : 'ticket.create', targetType: 'ticket', targetId: t.id, metadata: { number, subject: input.subject, clientId } }, tx);
      return t;
    });

    if (staff) {
      this.notifications.notify({ userId: clientId, type: 'ticket.created', title: `New ticket ${number} from your account manager`, body: `${input.subject}\n\n${input.body.slice(0, 500)}`, link: `/tickets?id=${ticket.id}`, preference: 'managerReplied' });
    } else if (assignedManagerId) {
      this.notifications.notify({
        userId: assignedManagerId,
        type: 'ticket.created',
        title: `New ticket ${number}${input.priority === 'high' || input.priority === 'urgent' ? ` · ${input.priority} priority` : ''}`,
        body: `${client.name}: ${input.subject}\n\n${input.body.slice(0, 400)}`,
        link: `/tickets?id=${ticket.id}`,
      });
    } else {
      for (const adminId of await this.adminIds()) {
        this.notifications.notify({ userId: adminId, type: 'ticket.created', title: `Unassigned ticket ${number}`, body: `${client.name}: ${input.subject}`, link: `/tickets?id=${ticket.id}` });
      }
    }
    this.broadcast(ticket);
    return { id: ticket.id, number: ticket.number, subject: ticket.subject };
  }

  async createFromConversation(input: {
    actor: TicketActor;
    clientId: string;
    managerId: string;
    conversationId: string;
    subject?: string;
    transcript: { name: string; at: Date; body: string }[];
  }) {
    const lastClientLine = [...input.transcript].reverse().find((l) => l.body.trim())?.body ?? 'Chat follow-up';
    const subject = (input.subject ?? lastClientLine).replace(/\s+/g, ' ').slice(0, 120);
    const number = await this.nextNumber();
    const body = ['Created from live chat. Recent messages:', '', ...input.transcript.map((l) => `[${new Date(l.at).toISOString().slice(0, 16).replace('T', ' ')}] ${l.name}: ${l.body}`)].join('\n');
    const settings = await this.settings.get();
    const now = new Date();

    const ticket = await this.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tickets)
        .values({
          number,
          userId: input.clientId,
          assignedManagerId: input.managerId,
          subject,
          category: 'other',
          source: 'chat',
          conversationId: input.conversationId,
          lastSenderId: input.actor.id,
          ...initialSla('normal', now, settings),
        })
        .returning();
      await tx.insert(ticketMessages).values({ ticketId: t.id, senderId: input.actor.id, body, kind: 'message' });
      await this.auditLog.record({ actorId: input.actor.id, action: 'ticket.from_chat', targetType: 'ticket', targetId: t.id, metadata: { number } }, tx);
      return t;
    });
    const other = input.actor.id === input.clientId ? input.managerId : input.clientId;
    this.notifications.notify({ userId: other, type: 'ticket.created', title: `Ticket ${number} opened from chat`, body: subject, link: `/tickets?id=${ticket.id}` });
    this.broadcast(ticket);
    return { id: ticket.id, number: ticket.number, subject: ticket.subject };
  }

  // ── Conversation ───────────────────────────────────────────────────────

  async reply(id: string, actor: TicketActor, input: ReplyTicketInput) {
    const t = await this.load(id, actor);
    const staff = isStaff(actor);
    if ((input.internal || input.macroId) && !staff) throw new AuthorizationError();
    if (t.status === 'closed') throw new ValidationError('This ticket is closed — open a new one', { reason: 'TICKET_CLOSED' });

    const macro = input.macroId
      ? await this.db.query.ticketMacros.findFirst({ where: and(eq(ticketMacros.id, input.macroId), or(isNull(ticketMacros.ownerId), eq(ticketMacros.ownerId, actor.id))) })
      : null;
    if (input.macroId && !macro) throw new NotFoundError('Macro');
    const actions = macro ? (macroActionsSchema.safeParse(macro.actions).data ?? {}) : {};

    const settings = await this.settings.get();
    const now = new Date();
    let nextStatus: TicketStatus = t.status;
    if (!input.internal) {
      if (staff) nextStatus = input.resolve ? 'resolved' : 'waiting_on_client';
      else nextStatus = input.resolve ? 'resolved' : 'open';
    }
    if (actions.status && !input.resolve) nextStatus = actions.status;
    const nextPriority = actions.priority ?? t.priority;
    const nextTags = actions.addTags?.length ? [...new Set([...t.tags, ...actions.addTags])].slice(0, 10) : t.tags;

    const updated = await this.db.transaction(async (tx) => {
      const [msg] = await tx.insert(ticketMessages).values({ ticketId: t.id, senderId: actor.id, body: input.body, isInternalNote: input.internal }).returning();
      await this.attachments.link(tx, actor.id, input.attachmentIds, 'ticket_message', msg.id);

      const events: ReturnType<TicketsService['event']>[] = [];
      if (nextStatus !== t.status) events.push(this.event(t.id, `Status changed to ${STATUS_LABEL[nextStatus]}`, { from: t.status, to: nextStatus }, actor.id));
      if (nextPriority !== t.priority) events.push(this.event(t.id, `Priority set to ${nextPriority}`, { from: t.priority, to: nextPriority, macro: macro?.title }, actor.id));
      if (nextTags !== t.tags) events.push(this.event(t.id, `Tagged ${actions.addTags!.join(', ')}`, { addTags: actions.addTags, macro: macro?.title }, actor.id));
      if (events.length) await tx.insert(ticketMessages).values(events);
      if (macro) await tx.update(ticketMacros).set({ usageCount: sql`${ticketMacros.usageCount} + 1` }).where(eq(ticketMacros.id, macro.id));

      const firstResponse = staff && !input.internal && !t.firstResponseAt;
      const slaRow = { ...t, firstResponseAt: firstResponse ? now : t.firstResponseAt };
      const sla: SlaPatch = { ...(nextPriority !== t.priority ? reprioritiseSla(slaRow, nextPriority, settings, now) : {}), ...statusSla(slaRow, nextStatus, settings, now) };

      const [row] = await tx
        .update(tickets)
        .set({
          status: nextStatus,
          priority: nextPriority,
          tags: nextTags,
          updatedAt: now,
          ...sla,
          ...(input.internal ? { staffReadAt: now } : { lastMessageAt: now, lastSenderId: actor.id }),
          ...(staff ? { staffReadAt: now } : { clientReadAt: now }),
          ...(firstResponse ? { firstResponseAt: now } : {}),
          ...(nextStatus === 'resolved' && t.status !== 'resolved' ? { resolvedAt: now } : {}),
          ...(!staff ? { reminderSentAt: null } : {}),
          ...(staff && !t.assignedManagerId && actor.role === UserRole.MANAGER ? { assignedManagerId: actor.id } : {}),
        })
        .where(eq(tickets.id, t.id))
        .returning();
      return row;
    });

    if (!input.internal) {
      const recipient = staff ? updated.userId : updated.assignedManagerId;
      if (recipient) {
        const resolved = nextStatus === 'resolved';
        this.notifications.notify({
          userId: recipient,
          type: 'ticket.reply',
          title: `${staff ? 'Reply' : 'Client reply'} on ${t.number}${resolved ? ' · resolved' : ''}`,
          body: `${t.subject}\n\n${input.body.slice(0, 500)}${resolved && staff && settings.csat.enabled ? '\n\nHow did we do? Open the ticket to rate this conversation.' : ''}`,
          link: `/tickets?id=${t.id}`,
          preference: 'managerReplied',
        });
      }
    }
    this.broadcast(updated);
    return { id: t.id, status: updated.status };
  }

  // ── Updates ────────────────────────────────────────────────────────────

  async update(id: string, actor: TicketActor, input: UpdateTicketInput) {
    const t = await this.load(id, actor);
    const staff = isStaff(actor);
    if (!staff) {
      const allowed =
        (input.status === 'resolved' || (input.status === 'open' && t.status === 'resolved')) &&
        !input.priority &&
        !input.category &&
        input.assignedManagerId === undefined &&
        !input.tags;
      if (!allowed) throw new AuthorizationError('You can mark a ticket resolved or reopen it');
    }
    if (t.mergedIntoId) throw new ValidationError('This ticket was merged — update the ticket it was merged into', { reason: 'TICKET_MERGED' });
    if (input.assignedManagerId !== undefined && input.assignedManagerId !== t.assignedManagerId) {
      if (!isAdmin(actor)) throw new AuthorizationError('Only admins can reassign tickets');
      if (input.assignedManagerId) {
        const mgr = await this.db.query.users.findFirst({ where: and(eq(users.id, input.assignedManagerId), eq(users.role, 'manager'), eq(users.status, 'active')), columns: { id: true } });
        if (!mgr) throw new ValidationError('That manager does not exist or is not active');
      }
    }

    const settings = await this.settings.get();
    const now = new Date();
    const events: ReturnType<TicketsService['event']>[] = [];
    const statusChanged = input.status && input.status !== t.status;
    const priorityChanged = input.priority && input.priority !== t.priority;
    const assigneeChanged = input.assignedManagerId !== undefined && input.assignedManagerId !== t.assignedManagerId;
    const tagsChanged = input.tags && (input.tags.length !== t.tags.length || input.tags.some((x) => !t.tags.includes(x)));
    if (statusChanged) events.push(this.event(t.id, `Status changed to ${STATUS_LABEL[input.status!]}`, { from: t.status, to: input.status }, actor.id));
    if (priorityChanged) events.push(this.event(t.id, `Priority set to ${input.priority}`, { from: t.priority, to: input.priority }, actor.id));
    if (input.category && input.category !== t.category) events.push(this.event(t.id, `Category set to ${input.category}`, { from: t.category, to: input.category }, actor.id));
    if (assigneeChanged) {
      const name = input.assignedManagerId ? (await this.db.query.users.findFirst({ where: eq(users.id, input.assignedManagerId), columns: { name: true } }))?.name : null;
      events.push(this.event(t.id, name ? `Assigned to ${name}` : 'Unassigned', { from: t.assignedManagerId, to: input.assignedManagerId }, actor.id));
    }
    if (tagsChanged) {
      const added = input.tags!.filter((x) => !t.tags.includes(x));
      const removed = t.tags.filter((x) => !input.tags!.includes(x));
      events.push(this.event(t.id, [added.length ? `Tagged ${added.join(', ')}` : '', removed.length ? `Removed ${removed.join(', ')}` : ''].filter(Boolean).join(' · '), { added, removed }, actor.id));
    }
    if (events.length === 0) return { id: t.id, status: t.status };

    const nextStatus = input.status ?? t.status;
    const sla: SlaPatch = {
      ...(priorityChanged ? reprioritiseSla(t, input.priority!, settings, now) : {}),
      ...(statusChanged ? statusSla(t, nextStatus, settings, now) : {}),
    };

    const updated = await this.db.transaction(async (tx) => {
      await tx.insert(ticketMessages).values(events);
      const [row] = await tx
        .update(tickets)
        .set({
          status: input.status,
          priority: input.priority,
          category: input.category,
          assignedManagerId: input.assignedManagerId,
          tags: input.tags,
          updatedAt: now,
          ...sla,
          ...(input.status === 'resolved' && t.status !== 'resolved' ? { resolvedAt: now } : {}),
          ...(input.status === 'closed' ? { closedAt: now } : {}),
          ...(input.status && OPEN_STATUSES.includes(input.status) ? { resolvedAt: null, closedAt: null } : {}),
        })
        .where(eq(tickets.id, t.id))
        .returning();
      await this.auditLog.record({ actorId: actor.id, action: 'ticket.update', targetType: 'ticket', targetId: t.id, metadata: input }, tx);
      return row;
    });

    if (statusChanged) {
      const recipient = actor.id === updated.userId ? updated.assignedManagerId : updated.userId;
      if (recipient) {
        const resolvedForClient = input.status === 'resolved' && recipient === updated.userId && settings.csat.enabled;
        this.notifications.notify({
          userId: recipient,
          type: 'ticket.status',
          title: `${t.number} is now ${STATUS_LABEL[input.status!].toLowerCase()}`,
          body: `${t.subject}${resolvedForClient ? '\n\nHow did we do? Open the ticket to rate this conversation.' : ''}`,
          link: `/tickets?id=${t.id}`,
        });
      }
    }
    if (assigneeChanged && input.assignedManagerId) {
      this.notifications.notify({ userId: input.assignedManagerId, type: 'ticket.assigned', title: `${t.number} assigned to you`, body: t.subject, link: `/tickets?id=${t.id}` });
    }
    this.broadcast(updated, t.assignedManagerId ? [t.assignedManagerId] : []);
    return { id: t.id, status: updated.status };
  }

  /** Apply one change set to many tickets; each ticket gets its own events/audit row. */
  async bulkUpdate(actor: TicketActor, input: BulkUpdateTicketsInput) {
    if (!isStaff(actor)) throw new AuthorizationError();
    const results = { updated: 0, failed: [] as { id: string; message: string }[] };
    for (const id of [...new Set(input.ids)]) {
      try {
        const t = await this.load(id, actor);
        const tags =
          input.addTags?.length || input.removeTags?.length
            ? [...new Set([...t.tags, ...(input.addTags ?? [])])].filter((x) => !(input.removeTags ?? []).includes(x)).slice(0, 10)
            : undefined;
        await this.update(id, actor, { status: input.status, priority: input.priority, assignedManagerId: input.assignedManagerId, tags });
        results.updated++;
      } catch (e) {
        results.failed.push({ id, message: (e as Error).message });
      }
    }
    return results;
  }

  /**
   * Fold a duplicate into another ticket of the same client: messages move
   * across (chronology preserved), tags union, and the source closes with a pointer.
   */
  async merge(sourceId: string, actor: TicketActor, input: MergeTicketInput) {
    if (!isStaff(actor)) throw new AuthorizationError();
    if (sourceId === input.targetId) throw new ValidationError('Pick a different ticket to merge into');
    const [source, target] = await Promise.all([this.load(sourceId, actor), this.load(input.targetId, actor)]);
    if (source.userId !== target.userId) throw new ValidationError('Only tickets from the same client can be merged', { reason: 'MERGE_DIFFERENT_CLIENT' });
    if (source.mergedIntoId) throw new ValidationError('This ticket was already merged');
    if (target.status === 'closed') throw new ValidationError('Reopen the target ticket first — it is closed', { reason: 'MERGE_TARGET_CLOSED' });

    const settings = await this.settings.get();
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(ticketMessages).set({ ticketId: target.id }).where(eq(ticketMessages.ticketId, source.id));
      await tx.insert(ticketMessages).values([
        this.event(target.id, `Merged ${source.number} (“${source.subject}”) into this ticket`, { mergedFrom: source.id, number: source.number }, actor.id),
        this.event(source.id, `Merged into ${target.number}`, { mergedInto: target.id, number: target.number }, actor.id),
      ]);
      await tx
        .update(tickets)
        .set({ status: 'closed', closedAt: now, mergedIntoId: target.id, updatedAt: now, ...statusSla(source, 'closed', settings, now) })
        .where(eq(tickets.id, source.id));
      await tx
        .update(tickets)
        .set({
          tags: [...new Set([...target.tags, ...source.tags])].slice(0, 10),
          lastMessageAt: source.lastMessageAt > target.lastMessageAt ? source.lastMessageAt : target.lastMessageAt,
          updatedAt: now,
        })
        .where(eq(tickets.id, target.id));
      await this.auditLog.record({ actorId: actor.id, action: 'ticket.merge', targetType: 'ticket', targetId: target.id, metadata: { from: source.number, into: target.number } }, tx);
    });
    this.broadcast(source);
    this.broadcast(target);
    return { id: target.id, number: target.number };
  }

  /** Client satisfaction rating on a resolved ticket; low scores alert the assignee. */
  async rate(id: string, actor: TicketActor, input: TicketCsatInput) {
    if (actor.role !== UserRole.CLIENT) throw new AuthorizationError('Only the client can rate a ticket');
    const t = await this.load(id, actor);
    if (!DONE_STATUSES.includes(t.status)) throw new ValidationError('You can rate a ticket once it is resolved', { reason: 'TICKET_NOT_RESOLVED' });
    const settings = await this.settings.get();
    if (!settings.csat.enabled) throw new ValidationError('Ratings are turned off');
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(tickets).set({ csatRating: input.rating, csatComment: input.comment ?? null, csatAt: now, updatedAt: now }).where(eq(tickets.id, t.id));
      await tx.insert(ticketMessages).values(this.event(t.id, `Rated ${input.rating}/5${input.comment ? ` · “${input.comment.slice(0, 200)}”` : ''}`, { csat: input.rating }, actor.id));
    });
    if (input.rating <= 2 && t.assignedManagerId) {
      this.notifications.notify({ userId: t.assignedManagerId, type: 'ticket.csat', title: `Low rating (${input.rating}/5) on ${t.number}`, body: `${t.subject}${input.comment ? `\n\n“${input.comment}”` : ''}`, link: `/tickets?id=${t.id}` });
    }
    this.broadcast(t);
    return { rating: input.rating };
  }

  /** Staff add credits while handling a billing ticket — ledger entry + a visible event line. */
  async grantCredits(id: string, actor: TicketActor, input: TicketGrantCreditsInput) {
    if (!isStaff(actor)) throw new AuthorizationError();
    const t = await this.load(id, actor);
    const note = [`Ticket ${t.number}`, input.note].filter(Boolean).join(' · ');
    const balance = await this.db.transaction(async (tx) => {
      const newBalance = await this.credits.apply(t.userId, input.amount, 'manual_add', { performedBy: actor.id, note, referenceId: t.id, tx });
      const actorRow = await tx.query.users.findFirst({ where: eq(users.id, actor.id), columns: { name: true } });
      await tx.insert(ticketMessages).values(
        this.event(t.id, `${actorRow?.name ?? 'Staff'} added ${input.amount.toLocaleString('en-US')} credits${input.note ? ` · ${input.note}` : ''}`, { credits: input.amount }, actor.id),
      );
      await tx.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, t.id));
      await this.auditLog.record({ actorId: actor.id, action: 'credits.manual_grant', targetType: 'user', targetId: t.userId, metadata: { amount: input.amount, ticket: t.number } }, tx);
      return newBalance;
    });
    this.notifications.notify({ userId: t.userId, type: 'credits.added', title: `${input.amount.toLocaleString('en-US')} credits added`, body: `On ticket ${t.number}. Your balance is now ${balance.toLocaleString('en-US')}.`, link: `/billing`, preference: 'paymentConfirmed' });
    this.broadcast(t);
    return { balance };
  }
}
