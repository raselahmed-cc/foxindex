import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { chatConversations, chatMessages, urlSubmissions, urls, users } from '@foxindex/database';
import { normalizeUrl } from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';

export interface ConversationRow {
  id: string;
  clientId: string;
  managerId: string;
  managerName: string;
  createdAt: string;
  internalNote: string | null;
  peer: {
    id: string;
    name: string;
    email: string;
    whatsapp: string | null;
    phone: string | null;
    status: string;
    credits: number;
    availability: string;
    createdAt: string;
  };
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unread: number;
}

export interface MessageMeta {
  quickReplies?: string[];
  answered?: string;
  replyTo?: string;
  system?: 'ticket_created';
  ticketNumber?: string;
  ticketId?: string;
}

const iso = (v: string | Date) => new Date(v).toISOString();

@Injectable()
export class ChatRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Conversation list for an actor. Clients see their one manager; managers
   * see each assigned client (rows created in one bulk insert); admins with
   * scope "all" supervise every conversation. One query, no N+1.
   */
  async listConversations(actor: { id: string; role: UserRole }, scope: 'mine' | 'all' = 'mine'): Promise<ConversationRow[]> {
    const isClient = actor.role === UserRole.CLIENT;
    const supervise = scope === 'all' && (actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN);

    if (!supervise) {
      let pairs: { clientId: string; managerId: string }[];
      if (isClient) {
        const me = await this.db.query.users.findFirst({ where: eq(users.id, actor.id), columns: { assignedManagerId: true } });
        if (!me?.assignedManagerId) return [];
        pairs = [{ clientId: actor.id, managerId: me.assignedManagerId }];
      } else {
        const clients = await this.db.query.users.findMany({ where: eq(users.assignedManagerId, actor.id), columns: { id: true } });
        pairs = clients.map((c) => ({ clientId: c.id, managerId: actor.id }));
      }
      if (pairs.length === 0) return [];
      await this.db.insert(chatConversations).values(pairs).onConflictDoNothing();
    }

    const filter = supervise
      ? sql`p.assigned_manager_id = c.manager_id`
      : isClient
        ? sql`c.client_id = ${actor.id} AND c.manager_id = (SELECT assigned_manager_id FROM ${users} WHERE id = ${actor.id})`
        : sql`c.manager_id = ${actor.id} AND p.assigned_manager_id = ${actor.id}`;
    const peerJoin = isClient ? sql`p.id = c.manager_id` : sql`p.id = c.client_id`;
    // Unread = messages the viewer hasn't read; supervisors count what the client sent and the manager hasn't read.
    const unreadBy = supervise ? sql`m.sender_id = c.client_id` : sql`m.sender_id <> ${actor.id}`;

    const result = await this.db.execute<{
      id: string;
      client_id: string;
      manager_id: string;
      manager_name: string;
      created_at: string;
      internal_note: string | null;
      peer_id: string;
      peer_name: string;
      peer_email: string;
      peer_whatsapp: string | null;
      peer_phone: string | null;
      peer_status: string;
      peer_credits: number;
      peer_availability: string;
      peer_created_at: string;
      last_body: string | null;
      last_sender: string | null;
      last_at: string | null;
      unread: string;
    }>(sql`
      SELECT c.id, c.client_id, c.manager_id, mgr.name AS manager_name, c.created_at, c.internal_note,
             p.id AS peer_id, p.name AS peer_name, p.email AS peer_email, p.whatsapp AS peer_whatsapp,
             p.phone AS peer_phone, p.status AS peer_status, p.credit_balance_cached AS peer_credits,
             p.availability AS peer_availability, p.created_at AS peer_created_at,
             lm.body AS last_body, lm.sender_id AS last_sender, lm.created_at AS last_at,
             (SELECT count(*) FROM ${chatMessages} m
                WHERE m.conversation_id = c.id AND ${unreadBy} AND m.read_at IS NULL) AS unread
      FROM ${chatConversations} c
      JOIN ${users} p ON ${peerJoin}
      JOIN ${users} mgr ON mgr.id = c.manager_id
      LEFT JOIN LATERAL (
        SELECT body, sender_id, created_at FROM ${chatMessages} m
        WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
      ) lm ON true
      WHERE ${filter} ${supervise ? sql`AND lm.created_at IS NOT NULL` : sql``}
      ORDER BY lm.created_at DESC NULLS LAST, p.name ASC
      LIMIT 500
    `);

    return result.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      managerId: r.manager_id,
      managerName: r.manager_name,
      createdAt: iso(r.created_at),
      internalNote: r.internal_note,
      peer: {
        id: r.peer_id,
        name: r.peer_name,
        email: r.peer_email,
        whatsapp: r.peer_whatsapp,
        phone: r.peer_phone,
        status: r.peer_status,
        credits: Number(r.peer_credits),
        availability: r.peer_availability,
        createdAt: iso(r.peer_created_at),
      },
      lastMessage: r.last_body !== null && r.last_sender && r.last_at ? { body: r.last_body, senderId: r.last_sender, createdAt: iso(r.last_at) } : null,
      unread: Number(r.unread),
    }));
  }

  findConversationById(id: string) {
    return this.db.query.chatConversations.findFirst({ where: eq(chatConversations.id, id) });
  }

  /** Newest `limit` messages (optionally before a cursor), returned oldest → newest, with sender names. */
  async listMessages(conversationId: string, opts: { limit?: number; before?: Date } = {}) {
    const rows = await this.db
      .select({ message: chatMessages, senderName: users.name })
      .from(chatMessages)
      .innerJoin(users, eq(users.id, chatMessages.senderId))
      .where(and(eq(chatMessages.conversationId, conversationId), opts.before ? lt(chatMessages.createdAt, opts.before) : undefined))
      .orderBy(desc(chatMessages.createdAt))
      .limit(opts.limit ?? 50);
    return rows.reverse();
  }

  findMessage(id: string) {
    return this.db.query.chatMessages.findFirst({ where: eq(chatMessages.id, id) });
  }

  async markAnswered(messageId: string, answer: string) {
    await this.db
      .update(chatMessages)
      .set({ meta: sql`coalesce(${chatMessages.meta}, '{}'::jsonb) || ${JSON.stringify({ answered: answer })}::jsonb` })
      .where(eq(chatMessages.id, messageId));
  }

  async markRead(conversationId: string, readerId: string) {
    const rows = await this.db
      .update(chatMessages)
      .set({ readAt: new Date() })
      .where(and(eq(chatMessages.conversationId, conversationId), ne(chatMessages.senderId, readerId), isNull(chatMessages.readAt)))
      .returning({ id: chatMessages.id });
    return rows.map((r) => r.id);
  }

  async updateNote(conversationId: string, note: string) {
    await this.db.update(chatConversations).set({ internalNote: note || null }).where(eq(chatConversations.id, conversationId));
  }

  /**
   * Called when a client is reassigned: their history moves to the new
   * manager. If a conversation with the new manager already exists, messages
   * are merged into it so there's still exactly one thread per pair.
   */
  async transferClient(clientId: string, newManagerId: string): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.query.chatConversations.findMany({ where: eq(chatConversations.clientId, clientId) });
      const target = existing.find((c) => c.managerId === newManagerId);
      const others = existing.filter((c) => c.managerId !== newManagerId);
      if (others.length === 0) return target?.id ?? null;
      if (target) {
        await tx.update(chatMessages).set({ conversationId: target.id }).where(inArray(chatMessages.conversationId, others.map((c) => c.id)));
        await tx.delete(chatConversations).where(inArray(chatConversations.id, others.map((c) => c.id)));
        return target.id;
      }
      const [keep, ...rest] = others;
      if (rest.length) {
        await tx.update(chatMessages).set({ conversationId: keep.id }).where(inArray(chatMessages.conversationId, rest.map((c) => c.id)));
        await tx.delete(chatConversations).where(inArray(chatConversations.id, rest.map((c) => c.id)));
      }
      await tx.update(chatConversations).set({ managerId: newManagerId }).where(eq(chatConversations.id, keep.id));
      return keep.id;
    });
  }

  /** Today's reply stats for a manager's inbox header. */
  async stats(managerId: string) {
    const result = await this.db.execute<{ avg_minutes: string | null; replied: string; waiting: string }>(sql`
      WITH msgs AS (
        SELECT m.conversation_id, m.created_at, m.sender_id, c.client_id,
          lag(m.sender_id) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_sender
        FROM ${chatMessages} m JOIN ${chatConversations} c ON c.id = m.conversation_id
        WHERE c.manager_id = ${managerId} AND m.created_at >= date_trunc('day', now()) - interval '1 day'
      ),
      -- A client message that opens a new exchange (the previous message wasn't theirs).
      asks AS (
        SELECT conversation_id, created_at AS asked_at, client_id FROM msgs
        WHERE sender_id = client_id AND created_at >= date_trunc('day', now())
          AND (prev_sender IS NULL OR prev_sender <> client_id)
      ),
      firsts AS (
        SELECT a.asked_at,
          (SELECT min(r.created_at) FROM ${chatMessages} r
             WHERE r.conversation_id = a.conversation_id AND r.sender_id <> a.client_id AND r.created_at > a.asked_at) AS replied_at
        FROM asks a
      )
      SELECT
        avg(extract(epoch FROM replied_at - asked_at) / 60) FILTER (WHERE replied_at IS NOT NULL) AS avg_minutes,
        count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
        (SELECT count(*) FROM ${chatConversations} c2
          WHERE c2.manager_id = ${managerId}
            AND (SELECT sender_id FROM ${chatMessages} z WHERE z.conversation_id = c2.id ORDER BY z.created_at DESC LIMIT 1) = c2.client_id) AS waiting
      FROM firsts
    `);
    const r = result.rows[0];
    return {
      avgFirstReplyMinutesToday: r?.avg_minutes === null || r?.avg_minutes === undefined ? null : Math.round(Number(r.avg_minutes) * 10) / 10,
      repliedToday: Number(r?.replied ?? 0),
      awaitingReply: Number(r?.waiting ?? 0),
    };
  }

  /** Latest status per engine for URLs owned by the client of a conversation. */
  async urlStatus(clientId: string, rawUrls: string[]) {
    const normalized = new Map<string, string>();
    for (const raw of rawUrls) {
      try {
        normalized.set(normalizeUrl(raw).normalizedUrl, raw);
      } catch {
        /* not a URL */
      }
    }
    if (normalized.size === 0) return [];
    const rows = await this.db
      .select({
        url: urls.url,
        normalizedUrl: urls.normalizedUrl,
        indexedAt: urls.indexedAt,
        status: urlSubmissions.status,
        attempts: urlSubmissions.attempts,
        lastError: urlSubmissions.lastError,
        submittedAt: urlSubmissions.createdAt,
      })
      .from(urls)
      .leftJoin(urlSubmissions, eq(urlSubmissions.urlId, urls.id))
      .where(and(eq(urls.userId, clientId), inArray(urls.normalizedUrl, [...normalized.keys()])))
      .orderBy(desc(urlSubmissions.createdAt));

    const byUrl = new Map<string, { url: string; indexedAt: Date | null; statuses: string[]; attempts: number; lastError: string | null; submittedAt: Date | null }>();
    for (const r of rows) {
      const entry = byUrl.get(r.normalizedUrl) ?? { url: normalized.get(r.normalizedUrl) ?? r.url, indexedAt: r.indexedAt, statuses: [], attempts: 0, lastError: null, submittedAt: r.submittedAt };
      if (r.status) entry.statuses.push(r.status);
      entry.attempts = Math.max(entry.attempts, r.attempts ?? 0);
      entry.lastError ??= r.lastError;
      byUrl.set(r.normalizedUrl, entry);
    }
    return [...byUrl.values()].map((e) => ({
      url: e.url,
      status: e.indexedAt || e.statuses.includes('indexed') ? 'indexed' : e.statuses.includes('submitted') ? 'submitted' : e.statuses.length && e.statuses.every((s) => s === 'failed' || s === 'rejected') ? 'failed' : e.statuses.length ? 'queued' : 'unknown',
      attempts: e.attempts,
      lastError: e.lastError,
      submittedAt: e.submittedAt,
    }));
  }
}
