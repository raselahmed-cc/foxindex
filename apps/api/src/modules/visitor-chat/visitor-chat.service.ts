import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { users, visitorChatMessages, visitorChats, type Database } from '@foxindex/database';
import type { StartVisitorChatInput, UpdateVisitorChatInput, VisitorChatListQuery } from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthenticationError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { RealtimeService, VISITORS_ROOM } from '../../common/realtime/realtime.service';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hashVisitorToken, VisitorChatGateway } from './visitor-chat.gateway';

type ChatRow = typeof visitorChats.$inferSelect;
const STAFF_ROLES = [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN];

export interface VisitorMessageDto {
  id: string;
  senderType: 'visitor' | 'staff' | 'system';
  senderName: string;
  body: string;
  createdAt: Date;
}

@Injectable()
export class VisitorChatService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(VisitorChatGateway) private readonly gateway: VisitorChatGateway,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  private async messages(chat: ChatRow): Promise<VisitorMessageDto[]> {
    const rows = await this.db
      .select({ m: visitorChatMessages, staffName: users.name })
      .from(visitorChatMessages)
      .leftJoin(users, eq(users.id, visitorChatMessages.staffId))
      .where(eq(visitorChatMessages.chatId, chat.id))
      .orderBy(asc(visitorChatMessages.createdAt))
      .limit(500);
    return rows.map(({ m, staffName }) => ({
      id: m.id,
      senderType: m.senderType as VisitorMessageDto['senderType'],
      // Staff appear by first name only to visitors.
      senderName: m.senderType === 'visitor' ? chat.name : m.senderType === 'staff' ? (staffName ?? 'FoxIndex').split(' ')[0] : 'FoxIndex',
      body: m.body,
      createdAt: m.createdAt,
    }));
  }

  private publicChat(chat: ChatRow) {
    return { id: chat.id, name: chat.name, status: chat.status as 'open' | 'closed' };
  }

  private staffPing(chatId: string) {
    this.realtime.emitToRooms([VISITORS_ROOM], 'visitor:updated', { id: chatId });
  }

  // ── Visitor side (public, token-authenticated) ──────────────────────────

  async start(input: StartVisitorChatInput, meta: { ip?: string; userAgent?: string }) {
    if (input.website) throw new ValidationError('Please try again');
    const token = randomBytes(24).toString('base64url');
    const chat = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(visitorChats)
        .values({
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          tokenHash: hashVisitorToken(token),
          page: input.page ?? null,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent?.slice(0, 300) ?? null,
          lastSender: 'visitor',
        })
        .returning();
      await tx.insert(visitorChatMessages).values({ chatId: row.id, senderType: 'visitor', body: input.message });
      return row;
    });

    // Tell every active manager/admin — whoever answers first takes it.
    const staff = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, STAFF_ROLES), eq(users.status, 'active')));
    for (const s of staff) {
      this.notifications.notify({
        userId: s.id,
        type: 'visitor.new',
        title: `New website chat from ${input.name}`,
        body: input.message.slice(0, 300),
        link: `/chat?tab=visitors&id=${chat.id}`,
        emailDedupe: { key: `visitor-new:${chat.id}`, seconds: 600 },
      });
    }
    this.staffPing(chat.id);
    return { token, chat: this.publicChat(chat), messages: await this.messages(chat) };
  }

  private async byToken(token: string | undefined): Promise<ChatRow> {
    if (!token) throw new AuthenticationError('Missing chat token');
    const chat = await this.db.query.visitorChats.findFirst({ where: eq(visitorChats.tokenHash, hashVisitorToken(token)) });
    if (!chat) throw new AuthenticationError('This chat has expired');
    return chat;
  }

  async visitorThread(token: string | undefined) {
    const chat = await this.byToken(token);
    return { chat: this.publicChat(chat), messages: await this.messages(chat) };
  }

  async visitorSend(token: string | undefined, body: string) {
    const chat = await this.byToken(token);
    const now = new Date();
    const [msg] = await this.db.transaction(async (tx) => {
      // A visitor writing again reopens a closed chat.
      await tx.update(visitorChats).set({ lastSender: 'visitor', lastMessageAt: now, status: 'open' }).where(eq(visitorChats.id, chat.id));
      return tx.insert(visitorChatMessages).values({ chatId: chat.id, senderType: 'visitor', body }).returning();
    });
    const dto: VisitorMessageDto = { id: msg.id, senderType: 'visitor', senderName: chat.name, body, createdAt: msg.createdAt };
    this.gateway.emitToChat(chat.id, 'visitor:message', dto);
    this.staffPing(chat.id);
    return dto;
  }

  // ── Staff side ──────────────────────────────────────────────────────────

  async list(query: VisitorChatListQuery) {
    const rows = await this.db
      .select({ chat: visitorChats, assigneeName: users.name })
      .from(visitorChats)
      .leftJoin(users, eq(users.id, visitorChats.assignedTo))
      .where(query.status === 'all' ? undefined : eq(visitorChats.status, query.status))
      .orderBy(desc(visitorChats.lastMessageAt))
      .limit(200);
    const ids = rows.map((r) => r.chat.id);
    const previews = ids.length
      ? await this.db.execute<{ chat_id: string; body: string; sender_type: string }>(sql`
          SELECT DISTINCT ON (chat_id) chat_id, body, sender_type FROM ${visitorChatMessages}
          WHERE chat_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
          ORDER BY chat_id, created_at DESC`)
      : { rows: [] };
    const previewBy = new Map(previews.rows.map((p) => [p.chat_id, p]));
    const [{ unread }] = await this.db
      .select({ unread: sql<string>`count(*)` })
      .from(visitorChats)
      .where(and(eq(visitorChats.status, 'open'), eq(visitorChats.lastSender, 'visitor'), sql`(${visitorChats.staffReadAt} IS NULL OR ${visitorChats.staffReadAt} < ${visitorChats.lastMessageAt})`));
    return {
      unread: Number(unread),
      items: rows.map(({ chat, assigneeName }) => ({
        id: chat.id,
        name: chat.name,
        email: chat.email,
        status: chat.status,
        assignee: chat.assignedTo ? { id: chat.assignedTo, name: assigneeName ?? '' } : null,
        lastMessageAt: chat.lastMessageAt,
        createdAt: chat.createdAt,
        unread: chat.lastSender === 'visitor' && (!chat.staffReadAt || chat.staffReadAt < chat.lastMessageAt),
        preview: previewBy.get(chat.id) ? { body: previewBy.get(chat.id)!.body.slice(0, 140), fromVisitor: previewBy.get(chat.id)!.sender_type === 'visitor' } : null,
      })),
    };
  }

  private async load(id: string): Promise<ChatRow> {
    const chat = await this.db.query.visitorChats.findFirst({ where: eq(visitorChats.id, id) });
    if (!chat) throw new NotFoundError('Chat');
    return chat;
  }

  async staffThread(id: string) {
    const chat = await this.load(id);
    await this.db.update(visitorChats).set({ staffReadAt: new Date() }).where(eq(visitorChats.id, id));
    const assignee = chat.assignedTo ? await this.db.query.users.findFirst({ where: eq(users.id, chat.assignedTo), columns: { id: true, name: true } }) : null;
    return {
      id: chat.id,
      name: chat.name,
      email: chat.email,
      phone: chat.phone,
      status: chat.status,
      page: chat.page,
      createdAt: chat.createdAt,
      assignee: assignee ?? null,
      messages: await this.messages(chat),
    };
  }

  async staffReply(id: string, staff: { id: string }, body: string) {
    const chat = await this.load(id);
    const now = new Date();
    const [msg] = await this.db.transaction(async (tx) => {
      await tx
        .update(visitorChats)
        .set({
          lastSender: 'staff',
          lastMessageAt: now,
          staffReadAt: now,
          status: 'open',
          // First person to answer takes the chat.
          ...(chat.assignedTo ? {} : { assignedTo: staff.id }),
        })
        .where(eq(visitorChats.id, id));
      return tx.insert(visitorChatMessages).values({ chatId: id, senderType: 'staff', staffId: staff.id, body }).returning();
    });
    const me = await this.db.query.users.findFirst({ where: eq(users.id, staff.id), columns: { name: true } });
    const dto: VisitorMessageDto = { id: msg.id, senderType: 'staff', senderName: (me?.name ?? 'FoxIndex').split(' ')[0], body, createdAt: msg.createdAt };
    this.gateway.emitToChat(id, 'visitor:message', dto);
    this.staffPing(id);
    return dto;
  }

  async update(id: string, actor: { id: string }, input: UpdateVisitorChatInput) {
    const chat = await this.load(id);
    if (input.assignedTo) {
      const target = await this.db.query.users.findFirst({ where: and(eq(users.id, input.assignedTo), inArray(users.role, STAFF_ROLES), eq(users.status, 'active')), columns: { id: true } });
      if (!target) throw new ValidationError('Pick an active manager or admin');
    }
    await this.db.update(visitorChats).set({ status: input.status, assignedTo: input.assignedTo }).where(eq(visitorChats.id, id));
    if (input.status && input.status !== chat.status) {
      const note = input.status === 'closed' ? 'This chat was closed. Write again any time to reopen it.' : 'This chat was reopened.';
      const [msg] = await this.db.insert(visitorChatMessages).values({ chatId: id, senderType: 'system', body: note }).returning();
      this.gateway.emitToChat(id, 'visitor:message', { id: msg.id, senderType: 'system', senderName: 'FoxIndex', body: note, createdAt: msg.createdAt });
      this.gateway.emitToChat(id, 'visitor:status', { status: input.status });
    }
    await this.auditLog.record({ actorId: actor.id, action: 'visitor_chat.update', targetType: 'visitor_chat', targetId: id, metadata: input });
    this.staffPing(id);
    return { id };
  }
}
