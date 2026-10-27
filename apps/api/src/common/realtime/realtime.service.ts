import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { Namespace } from 'socket.io';

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
export const ADMINS_ROOM = 'staff:admins';
/** Every manager/admin socket — website visitor chats are a shared pre-sales pool. */
export const VISITORS_ROOM = 'staff:visitors';

/**
 * Thin handle on the /chat Socket.io namespace so any module (tickets,
 * notifications, admin) can push to a user without depending on the chat
 * gateway. With the Redis adapter, emits and room joins reach sockets on
 * every API replica. No-ops until the gateway has initialised.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Namespace | null = null;

  attach(server: Namespace): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, data);
  }

  emitToUsers(userIds: string[], event: string, data: unknown): void {
    if (!this.server || userIds.length === 0) return;
    this.server.to(userIds.map(userRoom)).emit(event, data);
  }

  emitToRooms(rooms: string[], event: string, data: unknown): void {
    this.server?.to(rooms).emit(event, data);
  }

  /** Puts every live socket of a user into a room (e.g. after a conversation is transferred to them). */
  joinUserToRoom(userId: string, room: string): void {
    if (!this.server) return;
    try {
      this.server.in(userRoom(userId)).socketsJoin(room);
    } catch (error) {
      this.logger.warn(`socketsJoin failed: ${(error as Error).message}`);
    }
  }

  leaveRoom(userId: string, room: string): void {
    this.server?.in(userRoom(userId)).socketsLeave(room);
  }
}

@Global()
@Module({ providers: [RealtimeService], exports: [RealtimeService] })
export class RealtimeModule {}
