import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type IORedis from 'ioredis';
import type { Mailer } from '@foxindex/auth';
import { notifications, users, type Database } from '@foxindex/database';
import { DEFAULT_USER_PREFERENCES, userPreferencesSchema, type NOTIFICATION_EVENTS } from '@foxindex/validation';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { RealtimeService } from '../../common/realtime/realtime.service';
import { onlineUsers } from '../../common/realtime/presence';
import { MAILER } from '../auth/mailer.provider';

type PreferenceEvent = (typeof NOTIFICATION_EVENTS)[number];

export interface NotifyInput {
  userId: string;
  /** Machine type, e.g. chat.message, ticket.reply. */
  type: string;
  title: string;
  body: string;
  /** In-app path the notification opens, e.g. /tickets?id=… */
  link?: string;
  /** Which Settings → Notifications row governs the channels. */
  preference?: PreferenceEvent;
  /** Only email when the recipient has no live connection (chat). */
  emailOnlyIfOffline?: boolean;
  /** Store + push a bell notification (default true). Chat uses its own unread badge instead. */
  inApp?: boolean;
  /** Collapse repeated emails with the same key for this many seconds. */
  emailDedupe?: { key: string; seconds: number };
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * One entry point for every user-facing notification: in-app (stored + pushed
 * live), email (respecting preferences, offline-only and de-duplication), and
 * WhatsApp when a provider is configured. Never throws — a failed email must
 * not fail the chat message or ticket reply that triggered it.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  async isOnline(userId: string): Promise<boolean> {
    return (await onlineUsers(this.redis, [userId])).has(userId);
  }

  notify(input: NotifyInput): void {
    void this.deliver(input).catch((error: Error) => this.logger.warn(`notify ${input.type} failed: ${error.message}`));
  }

  private async deliver(input: NotifyInput): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, input.userId),
      columns: { id: true, name: true, email: true, preferences: true, status: true },
    });
    if (!user || user.status === 'suspended') return;

    const prefs = userPreferencesSchema.partial().safeParse(user.preferences ?? {}).data;
    const channels = { ...DEFAULT_USER_PREFERENCES.notifications[input.preference ?? 'managerReplied'], ...(input.preference ? prefs?.notifications?.[input.preference] : {}) };
    const payload = { title: input.title, body: input.body, link: input.link ?? null };

    if (channels.inApp && input.inApp !== false) {
      const [row] = await this.db.insert(notifications).values({ userId: user.id, channel: 'in_app', type: input.type, payload, sentAt: new Date() }).returning();
      this.realtime.emitToUser(user.id, 'notification:new', { id: row.id, type: input.type, ...payload, createdAt: row.createdAt, readAt: null });
    }

    if (channels.email) {
      if (input.emailOnlyIfOffline && (await this.isOnline(user.id))) return;
      if (input.emailDedupe) {
        const fresh = await this.redis.set(`notify:${input.emailDedupe.key}:${user.id}`, '1', 'EX', input.emailDedupe.seconds, 'NX');
        if (fresh !== 'OK') return;
      }
      const appUrl = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
      const link = input.link ? `${appUrl}${input.link}` : appUrl;
      await this.mailer.send(
        user.email,
        input.title,
        `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
          <h2 style="margin:0 0 12px;font-size:18px">${escape(input.title)}</h2>
          <p style="white-space:pre-wrap;color:#333">${escape(input.body)}</p>
          <p><a href="${link}" style="display:inline-block;background:#4A6DF0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open FoxIndex</a></p>
          <p style="color:#888;font-size:12px;margin-top:24px">You can change which emails you get in Settings → Notifications.</p></div>`,
      );
      await this.db.insert(notifications).values({ userId: user.id, channel: 'email', type: input.type, payload, sentAt: new Date() });
    }
    // WhatsApp delivery needs a provider account (Meta Cloud API / Twilio); wired here once configured.
  }

  async list(userId: string, limit = 30) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.channel, 'in_app')))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    const [{ n }] = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.channel, 'in_app'), isNull(notifications.readAt)));
    return {
      unread: Number(n),
      items: rows.map((r) => ({ id: r.id, type: r.type, ...(r.payload as object), createdAt: r.createdAt, readAt: r.readAt })),
    };
  }

  async markRead(userId: string, ids?: string[]) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
    return { ok: true };
  }
}
