import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import { visitorChats, type Database } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';

export const hashVisitorToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const visitorChatRoom = (chatId: string) => `visitor-chat:${chatId}`;

/**
 * Receive-only socket for website visitors (`/visitor` namespace). The
 * visitor authenticates with the chat token from POST /public/chat/start and
 * is placed in that chat's room; staff replies are pushed there. Visitors
 * send messages over REST, which is rate limited.
 */
@Injectable()
@WebSocketGateway({ namespace: '/visitor', cors: { origin: process.env.CORS_ORIGIN, credentials: false } })
export class VisitorChatGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Namespace;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token || token.length > 200) {
      socket.disconnect(true);
      return;
    }
    const chat = await this.db.query.visitorChats.findFirst({ where: eq(visitorChats.tokenHash, hashVisitorToken(token)), columns: { id: true } });
    if (!chat) {
      socket.emit('visitor:invalid');
      socket.disconnect(true);
      return;
    }
    await socket.join(visitorChatRoom(chat.id));
  }

  emitToChat(chatId: string, event: string, payload: unknown): void {
    this.server?.to(visitorChatRoom(chatId)).emit(event, payload);
  }
}
