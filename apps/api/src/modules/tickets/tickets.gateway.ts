import { Inject, Injectable } from '@nestjs/common';
import { ConnectedSocket, MessageBody, type OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import type IORedis from 'ioredis';
import { eq } from 'drizzle-orm';
import { users, type Database } from '@foxindex/database';
import { UserRole } from '@foxindex/types';
import { ticketViewingSchema } from '@foxindex/validation';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { ADMINS_ROOM, RealtimeService, userRoom } from '../../common/realtime/realtime.service';
import { TicketsService } from './tickets.service';

interface SocketUser {
  id: string;
  role: UserRole;
}

/** A viewer lease lasts this long; the client refreshes it every ~20 s while the ticket is open. */
export const VIEWER_TTL_MS = 45_000;
const viewersKey = (ticketId: string) => `ticket:viewers:${ticketId}`;

export interface TicketViewer {
  id: string;
  name: string;
  state: 'viewing' | 'replying';
  until: number;
}

/**
 * Agent collision detection on the shared `/chat` socket (auth + rooms are
 * set up by ChatGateway's handshake). Staff report viewing/replying; every
 * staff member who can see the ticket gets the live viewer list. Clients never
 * receive these events.
 */
@Injectable()
@WebSocketGateway({ namespace: '/chat', cors: { origin: process.env.CORS_ORIGIN, credentials: true } })
export class TicketsGateway implements OnGatewayDisconnect {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
  ) {}

  @SubscribeMessage('ticket:viewing')
  async onViewing(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || user.role === UserRole.CLIENT) return { error: 'FORBIDDEN' };
    const parsed = ticketViewingSchema.safeParse(body);
    if (!parsed.success) return { error: 'INVALID' };
    const { ticketId, state } = parsed.data;

    let ticket: Awaited<ReturnType<TicketsService['assertStaffAccess']>>;
    try {
      ticket = await this.tickets.assertStaffAccess(ticketId, user);
    } catch {
      return { error: 'NOT_FOUND' };
    }

    const previous = socket.data.viewingTicketId as string | undefined;
    if (previous && previous !== ticketId) await this.leave(previous, user.id);

    if (state === 'left') {
      socket.data.viewingTicketId = undefined;
      await this.leave(ticketId, user.id, ticket.assignedManagerId);
      return { ok: true };
    }

    socket.data.viewingTicketId = ticketId;
    socket.data.name ??= (await this.db.query.users.findFirst({ where: eq(users.id, user.id), columns: { name: true } }))?.name ?? 'Staff';
    const viewer: TicketViewer = { id: user.id, name: socket.data.name as string, state, until: Date.now() + VIEWER_TTL_MS };
    await this.redis.hset(viewersKey(ticketId), user.id, JSON.stringify(viewer));
    await this.redis.pexpire(viewersKey(ticketId), VIEWER_TTL_MS);
    const viewers = await this.publish(ticketId, ticket.assignedManagerId);
    return { ok: true, viewers };
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const user = socket.data.user as SocketUser | undefined;
    const ticketId = socket.data.viewingTicketId as string | undefined;
    if (user && ticketId) await this.leave(ticketId, user.id).catch(() => undefined);
  }

  private async leave(ticketId: string, userId: string, assigneeId?: string | null) {
    await this.redis.hdel(viewersKey(ticketId), userId);
    await this.publish(ticketId, assigneeId ?? null);
  }

  private async current(ticketId: string): Promise<TicketViewer[]> {
    const raw = await this.redis.hgetall(viewersKey(ticketId));
    const now = Date.now();
    return Object.values(raw)
      .map((v) => JSON.parse(v) as TicketViewer)
      .filter((v) => v.until > now);
  }

  private async publish(ticketId: string, assigneeId: string | null) {
    const viewers = await this.current(ticketId);
    const rooms = [ADMINS_ROOM, ...new Set([assigneeId, ...viewers.map((v) => v.id)].filter((x): x is string => Boolean(x)).map(userRoom))];
    this.realtime.emitToRooms(rooms, 'ticket:viewers', { ticketId, viewers: viewers.map(({ id, name, state }) => ({ id, name, state })) });
    return viewers;
  }
}
