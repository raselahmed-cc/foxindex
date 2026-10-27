import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type IORedis from 'ioredis';
import { verifyAccessToken } from '@foxindex/auth';
import { UserRole, UserStatus } from '@foxindex/types';
import { markReadSchema, sendChatMessageSchema, typingSchema } from '@foxindex/validation';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { ADMINS_ROOM, conversationRoom, RealtimeService, userRoom, VISITORS_ROOM } from '../../common/realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { addPresence, onlineUsers, PRESENCE_HEARTBEAT_MS, refreshPresence, removePresence } from '../../common/realtime/presence';
import { ChatService } from './chat.service';

interface SocketUser {
  id: string;
  role: UserRole;
  status: UserStatus;
}

/** Sliding-ish fixed windows per user — generous for humans, fatal for scripts. */
export const RATE_LIMITS = {
  message: [
    { windowSeconds: 10, max: 15 },
    { windowSeconds: 3600, max: 400 },
  ],
  typing: [{ windowSeconds: 10, max: 40 }],
} as const;

const isAdmin = (role: UserRole) => role === UserRole.ADMIN || role === UserRole.SUPERADMIN;

/**
 * Real-time chat gateway. Auth happens once at handshake (JWT in
 * `socket.handshake.auth.token`). Every socket joins its user room (for
 * notifications/tickets pushes), its conversation rooms, and — for admins —
 * the supervisors room that mirrors every conversation. The Redis adapter
 * makes rooms and presence correct across API replicas.
 */
@Injectable()
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: process.env.CORS_ORIGIN, credentials: true },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server!: Namespace;

  private readonly logger = new Logger(ChatGateway.name);
  private heartbeat?: NodeJS.Timeout;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  afterInit(server: Namespace): void {
    this.realtime.attach(server);
    // Keep this replica's sockets' presence leases alive; a dead replica's simply expire.
    this.heartbeat = setInterval(() => {
      const entries = [...server.sockets.values()]
        .filter((s) => s.data.user)
        .map((s) => ({ userId: (s.data.user as SocketUser).id, socketId: s.id }));
      refreshPresence(this.redis, entries).catch((error: Error) => this.logger.warn(`presence heartbeat failed: ${error.message}`));
    }, PRESENCE_HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
  }

  /** True when the user is over any limit for this action. */
  async limited(userId: string, action: keyof typeof RATE_LIMITS): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    for (const { windowSeconds, max } of RATE_LIMITS[action]) {
      const key = `rl:chat:${action}:${userId}:${windowSeconds}:${Math.floor(now / windowSeconds)}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSeconds + 1);
      if (count > max) return true;
    }
    return false;
  }

  async handleConnection(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token as string | undefined;
    let user: SocketUser;
    try {
      if (!token) throw new Error('missing token');
      const payload = verifyAccessToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
      user = { id: payload.sub, role: payload.role, status: payload.status };
    } catch {
      socket.emit('auth:error', { message: 'Session expired' });
      socket.disconnect(true);
      return;
    }
    if (user.status === UserStatus.SUSPENDED) {
      socket.disconnect(true);
      return;
    }

    const conversations = await this.chat.listConversations(user);
    socket.data.user = user;
    socket.data.conversationIds = conversations.map((c) => c.id);
    await socket.join([userRoom(user.id), ...conversations.map((c) => conversationRoom(c.id)), ...(isAdmin(user.role) ? [ADMINS_ROOM] : []), ...(user.role !== UserRole.CLIENT ? [VISITORS_ROOM] : [])]);

    // Tell this socket who is already online — the broadcast below only fires on a 0 → 1 transition.
    if (conversations.length) {
      const online = await onlineUsers(this.redis, [...new Set(conversations.map((c) => c.peer.id))]);
      for (const userId of online) socket.emit('presence:update', { userId, online: true });
    }

    const count = await addPresence(this.redis, user.id, socket.id);
    if (count === 1) {
      for (const id of socket.data.conversationIds as string[]) {
        socket.to(conversationRoom(id)).emit('presence:update', { userId: user.id, online: true });
      }
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const user = socket.data.user as SocketUser | undefined;
    if (!user) return;
    const count = await removePresence(this.redis, user.id, socket.id);
    if (count === 0) {
      for (const id of (socket.data.conversationIds as string[] | undefined) ?? []) {
        socket.to(conversationRoom(id)).emit('presence:update', { userId: user.id, online: false });
      }
    }
  }

  @SubscribeMessage('message:send')
  async onMessageSend(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const user = socket.data.user as SocketUser;
    if (await this.limited(user.id, 'message')) return { error: 'RATE_LIMITED' };
    const parsed = sendChatMessageSchema.safeParse(body);
    if (!parsed.success) return { error: 'INVALID_MESSAGE' };

    let result: Awaited<ReturnType<ChatService['sendMessage']>>;
    try {
      result = await this.chat.sendMessage(user, parsed.data);
    } catch (error) {
      this.logger.warn(`message:send rejected for user=${user.id}: ${(error as Error).message}`);
      return { error: (error as { details?: { reason?: string } }).details?.reason ?? 'FORBIDDEN' };
    }

    const { conversation, message } = result;
    const payload = { ...message, clientId: parsed.data.clientId };
    this.server.to([conversationRoom(conversation.id), ADMINS_ROOM]).emit('message:new', payload);

    // The other side gets an in-app notification, plus one email per 10-minute burst if they're offline.
    const recipients = user.id === conversation.clientId ? [conversation.managerId] : [conversation.clientId];
    const preview = message.body || (message.attachments.length ? `📎 ${message.attachments.map((a) => a.fileName).join(', ')}` : '');
    for (const recipient of recipients) {
      this.notifications.notify({
        userId: recipient,
        type: 'chat.message',
        title: `New message from ${message.senderName}`,
        body: preview.slice(0, 500),
        link: '/chat',
        preference: 'managerReplied',
        emailOnlyIfOffline: true,
        inApp: false,
        emailDedupe: { key: `chat:${conversation.id}`, seconds: 600 },
      });
    }
    return { ok: true, id: message.id, message: payload };
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const user = socket.data.user as SocketUser;
    const parsed = typingSchema.safeParse(body);
    if (!parsed.success) return;
    if (!(socket.data.conversationIds as string[]).includes(parsed.data.conversationId) && !isAdmin(user.role)) return;
    if (await this.limited(user.id, 'typing')) return;
    socket.to([conversationRoom(parsed.data.conversationId), ADMINS_ROOM]).emit('typing', {
      conversationId: parsed.data.conversationId,
      userId: user.id,
      isTyping: parsed.data.isTyping,
    });
  }

  @SubscribeMessage('read')
  async onRead(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const user = socket.data.user as SocketUser;
    const parsed = markReadSchema.safeParse(body);
    if (!parsed.success) return;
    const readIds = await this.chat.markRead(parsed.data.conversationId, user).catch(() => [] as string[]);
    if (readIds.length > 0) {
      socket.to([conversationRoom(parsed.data.conversationId), ADMINS_ROOM]).emit('read:ack', {
        conversationId: parsed.data.conversationId,
        readerId: user.id,
        messageIds: readIds,
      });
    }
  }

  /** Lets a client re-sync its room memberships after a conversation was created or transferred. */
  @SubscribeMessage('rooms:refresh')
  async onRoomsRefresh(@ConnectedSocket() socket: Socket) {
    const user = socket.data.user as SocketUser;
    const conversations = await this.chat.listConversations(user);
    const ids = conversations.map((c) => c.id);
    socket.data.conversationIds = ids;
    await socket.join(ids.map(conversationRoom));
    return { ok: true, count: ids.length };
  }
}
