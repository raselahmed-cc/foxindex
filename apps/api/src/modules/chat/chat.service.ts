import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { chatMessages, users, type Database } from '@foxindex/database';
import type { SendChatMessageInput } from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { AttachmentsService } from '../files/attachments.service';
import { TicketsService } from '../tickets/tickets.service';
import { ChatRepository, type MessageMeta } from './chat.repository';

export interface ChatActor {
  id: string;
  role: UserRole;
}

const isAdmin = (a: ChatActor) => a.role === UserRole.ADMIN || a.role === UserRole.SUPERADMIN;
const isStaff = (a: ChatActor) => a.role !== UserRole.CLIENT;

export type ChatMessageDto = Awaited<ReturnType<ChatService['toMessages']>>[number];

@Injectable()
export class ChatService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
  ) {}

  /** Clients never receive the staff-only note or the client's own account fields about the manager. */
  async listConversations(actor: ChatActor, scope: 'mine' | 'all' = 'mine') {
    const rows = await this.repo.listConversations(actor, scope);
    const isClient = actor.role === UserRole.CLIENT;
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      unread: r.unread,
      lastMessage: r.lastMessage,
      internalNote: isClient ? undefined : r.internalNote,
      managerId: isClient ? undefined : r.managerId,
      managerName: r.managerName,
      peer: {
        id: r.peer.id,
        name: r.peer.name,
        whatsapp: r.peer.whatsapp ?? r.peer.phone,
        since: r.peer.createdAt,
        ...(isClient ? { availability: r.peer.availability } : { email: r.peer.email, status: r.peer.status, credits: r.peer.credits }),
      },
    }));
  }

  /** Participants always; admins/superadmins may supervise any conversation. */
  async assertAccess(conversationId: string, actor: ChatActor) {
    const conversation = await this.repo.findConversationById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation');
    const participant = conversation.clientId === actor.id || conversation.managerId === actor.id;
    if (!participant && !isAdmin(actor)) throw new AuthorizationError();
    return { conversation, participant };
  }

  async toMessages(rows: Awaited<ReturnType<ChatRepository['listMessages']>>) {
    const files = await this.attachments.forOwners('chat_message', rows.map((r) => r.message.id));
    return rows.map(({ message, senderName }) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName,
      body: message.body,
      readAt: message.readAt,
      createdAt: message.createdAt,
      meta: (message.meta ?? null) as MessageMeta | null,
      attachments: files.get(message.id) ?? [],
    }));
  }

  async getMessages(conversationId: string, actor: ChatActor, before?: Date) {
    await this.assertAccess(conversationId, actor);
    const rows = await this.repo.listMessages(conversationId, { before, limit: 50 });
    return { messages: await this.toMessages(rows), hasMore: rows.length === 50 };
  }

  async sendMessage(actor: ChatActor, input: SendChatMessageInput) {
    const { conversation } = await this.assertAccess(input.conversationId, actor);
    const meta: MessageMeta = {};

    if (input.quickReplies?.length) {
      if (!isStaff(actor)) throw new AuthorizationError('Only staff can add reply buttons');
      meta.quickReplies = [...new Set(input.quickReplies)];
    }
    if (input.replyTo) {
      const target = await this.repo.findMessage(input.replyTo);
      const targetMeta = (target?.meta ?? {}) as MessageMeta;
      if (!target || target.conversationId !== conversation.id || !targetMeta.quickReplies?.includes(input.body) || targetMeta.answered) {
        throw new ValidationError('That option is no longer available', { reason: 'REPLY_INVALID' });
      }
      meta.replyTo = target.id;
    }

    const { row, files } = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(chatMessages)
        .values({ conversationId: conversation.id, senderId: actor.id, body: input.body, meta: Object.keys(meta).length ? meta : null })
        .returning();
      const linked = await this.attachments.link(tx, actor.id, input.attachmentIds, 'chat_message', created.id);
      return { row: created, files: linked };
    });
    if (meta.replyTo) await this.repo.markAnswered(meta.replyTo, input.body);

    const sender = await this.db.query.users.findFirst({ where: eq(users.id, actor.id), columns: { name: true } });
    return {
      conversation,
      message: {
        id: row.id,
        conversationId: row.conversationId,
        senderId: row.senderId,
        senderName: sender?.name ?? '',
        body: row.body,
        readAt: row.readAt,
        createdAt: row.createdAt,
        meta: (row.meta ?? null) as MessageMeta | null,
        attachments: files,
      },
    };
  }

  /** Only real participants mark messages read — a supervising admin reading must not clear the manager's unread state. */
  async markRead(conversationId: string, actor: ChatActor) {
    const { participant } = await this.assertAccess(conversationId, actor);
    if (!participant) return [];
    return this.repo.markRead(conversationId, actor.id);
  }

  async updateNote(conversationId: string, actor: ChatActor, note: string) {
    const { conversation } = await this.assertAccess(conversationId, actor);
    if (conversation.managerId !== actor.id && !isAdmin(actor)) throw new AuthorizationError();
    await this.repo.updateNote(conversationId, note);
    return { id: conversationId, internalNote: note || null };
  }

  async setAvailability(actor: ChatActor, availability: 'available' | 'away') {
    if (!isStaff(actor)) throw new AuthorizationError();
    await this.db.update(users).set({ availability, updatedAt: new Date() }).where(eq(users.id, actor.id));
    return { availability };
  }

  async getAvailability(actorId: string) {
    const row = await this.db.query.users.findFirst({ where: eq(users.id, actorId), columns: { availability: true } });
    return { availability: (row?.availability ?? 'available') as 'available' | 'away' };
  }

  stats(actor: ChatActor) {
    return this.repo.stats(actor.id);
  }

  async urlStatus(conversationId: string, actor: ChatActor, rawUrls: string[]) {
    const { conversation } = await this.assertAccess(conversationId, actor);
    return this.repo.urlStatus(conversation.clientId, rawUrls.slice(0, 20));
  }

  /** Creates a ticket from the recent conversation and drops a system message linking to it. */
  async toTicket(conversationId: string, actor: ChatActor, subject?: string) {
    const { conversation } = await this.assertAccess(conversationId, actor);
    const rows = await this.repo.listMessages(conversationId, { limit: 20 });
    if (rows.length === 0) throw new ValidationError('Send a message first — there is nothing to turn into a ticket yet');
    const ticket = await this.tickets.createFromConversation({
      actor,
      clientId: conversation.clientId,
      managerId: conversation.managerId,
      conversationId,
      subject,
      transcript: rows.map((r) => ({ name: r.senderName, at: r.message.createdAt, body: r.message.body })),
    });
    const sent = await this.sendSystem(conversation.id, actor.id, `Ticket ${ticket.number} created from this chat: “${ticket.subject}”`, {
      system: 'ticket_created',
      ticketNumber: ticket.number,
      ticketId: ticket.id,
    });
    return { ticket, message: sent };
  }

  private async sendSystem(conversationId: string, senderId: string, body: string, meta: MessageMeta) {
    const [row] = await this.db.insert(chatMessages).values({ conversationId, senderId, body, meta }).returning();
    const [msg] = await this.toMessages([{ message: row, senderName: '' }]);
    return msg;
  }
}
