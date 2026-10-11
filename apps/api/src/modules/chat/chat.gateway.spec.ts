import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import { signAccessToken } from '@foxindex/auth';
import { UserRole, UserStatus } from '@foxindex/types';
import { ChatGateway, RATE_LIMITS } from './chat.gateway';
import type { ChatService } from './chat.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RealtimeService } from '../../common/realtime/realtime.service';
import { AuthorizationError } from '../../common/errors/app-error';

const SECRET = 'gateway-test-secret';
const CONV = '11111111-1111-4111-8111-111111111111';
const CLIENT = 'client-1';
const MANAGER = 'manager-1';

/** Minimal in-memory Redis covering the calls the gateway makes (counters + presence zsets). */
function fakeRedis() {
  const store = new Map<string, number>();
  const zsets = new Map<string, Map<string, number>>();
  const zset = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;
  const bound = (v: number | string) => (v === '-inf' ? -Infinity : v === '+inf' ? Infinity : Number(v));
  const ops = {
    zadd: vi.fn(async (k: string, score: number, member: string) => {
      zset(k).set(member, score);
      return 1;
    }),
    zrem: vi.fn(async (k: string, member: string) => Number(zset(k).delete(member))),
    zremrangebyscore: vi.fn(async (k: string, min: number | string, max: number | string) => {
      for (const [m, sc] of zset(k)) if (sc >= bound(min) && sc <= bound(max)) zset(k).delete(m);
      return 0;
    }),
    zcount: vi.fn(async (k: string, min: number | string, max: number | string) => [...zset(k).values()].filter((sc) => sc >= bound(min) && sc <= bound(max)).length),
    pexpire: vi.fn(async () => 1),
  };
  return {
    store,
    zsets,
    ...ops,
    incr: vi.fn(async (k: string) => {
      store.set(k, (store.get(k) ?? 0) + 1);
      return store.get(k)!;
    }),
    expire: vi.fn(async () => 1),
    pipeline: () => {
      const queued: Promise<unknown>[] = [];
      const p = {
        zadd: (...a: [string, number, string]) => (queued.push(ops.zadd(...a)), p),
        pexpire: () => p,
        zcount: (...a: [string, number | string, number | string]) => (queued.push(ops.zcount(...a)), p),
        exec: async () => (await Promise.all(queued)).map((r) => [null, r]),
      };
      return p;
    },
  };
}

function fakeSocket(token?: string, data: Record<string, unknown> = {}) {
  const emitted: { event: string; payload: unknown }[] = [];
  const toEmit = vi.fn();
  return {
    id: 'sock-1',
    emitted,
    toEmit,
    handshake: { auth: token ? { token } : {} },
    data,
    join: vi.fn(async () => undefined),
    emit: vi.fn((event: string, payload: unknown) => emitted.push({ event, payload })),
    to: vi.fn(() => ({ emit: toEmit })),
    disconnect: vi.fn(),
  };
}

const message = {
  id: 'm1',
  conversationId: CONV,
  senderId: CLIENT,
  senderName: 'Test Client',
  body: 'Hello',
  readAt: null,
  createdAt: new Date(),
  meta: null,
  attachments: [],
};

describe('ChatGateway', () => {
  let redis: ReturnType<typeof fakeRedis>;
  let chat: Record<string, ReturnType<typeof vi.fn>>;
  let notifications: { notify: ReturnType<typeof vi.fn> };
  let serverEmit: ReturnType<typeof vi.fn>;
  let gateway: ChatGateway;

  beforeEach(() => {
    redis = fakeRedis();
    chat = {
      listConversations: vi.fn(async () => [{ id: CONV, peer: { id: MANAGER } }]),
      sendMessage: vi.fn(async () => ({ conversation: { id: CONV, clientId: CLIENT, managerId: MANAGER }, message })),
      markRead: vi.fn(async () => ['m0']),
    };
    notifications = { notify: vi.fn() };
    serverEmit = vi.fn();
    const config = { getOrThrow: () => SECRET } as unknown as ConfigService;
    gateway = new ChatGateway(
      config,
      chat as unknown as ChatService,
      redis as never,
      { attach: vi.fn() } as unknown as RealtimeService,
      notifications as unknown as NotificationsService,
    );
    gateway.server = { to: vi.fn(() => ({ emit: serverEmit })) } as never;
  });

  const clientToken = () => signAccessToken({ sub: CLIENT, role: UserRole.CLIENT, status: UserStatus.ACTIVE }, SECRET);
  const connected = () => fakeSocket(undefined, { user: { id: CLIENT, role: UserRole.CLIENT, status: UserStatus.ACTIVE }, conversationIds: [CONV] });

  it('rejects a handshake without a valid token', async () => {
    const socket = fakeSocket('not-a-jwt');
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(chat.listConversations).not.toHaveBeenCalled();
  });

  it('rejects a suspended account', async () => {
    const token = signAccessToken({ sub: CLIENT, role: UserRole.CLIENT, status: UserStatus.SUSPENDED }, SECRET);
    const socket = fakeSocket(token);
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('joins user + conversation rooms and reports peers already online', async () => {
    await redis.zadd(`chat:presence:${MANAGER}`, Date.now() + 60_000, 'mgr-sock');
    const socket = fakeSocket(clientToken());
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.join).toHaveBeenCalledWith([`user:${CLIENT}`, `conversation:${CONV}`]);
    expect(socket.emitted).toContainEqual({ event: 'presence:update', payload: { userId: MANAGER, online: true } });
    expect(redis.zsets.get(`chat:presence:${CLIENT}`)?.has('sock-1')).toBe(true);
  });

  it('broadcasts a sent message, echoes clientId, and notifies the other party', async () => {
    const socket = connected();
    const ack = await gateway.onMessageSend(socket as unknown as Socket, { conversationId: CONV, body: 'Hello', clientId: 'tmp-1' });
    expect(ack).toMatchObject({ ok: true, id: 'm1' });
    expect(serverEmit).toHaveBeenCalledWith('message:new', expect.objectContaining({ id: 'm1', clientId: 'tmp-1' }));
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: MANAGER, type: 'chat.message', emailOnlyIfOffline: true }));
  });

  it('rejects an invalid payload without touching the service', async () => {
    const ack = await gateway.onMessageSend(connected() as unknown as Socket, { conversationId: 'nope', body: '' });
    expect(ack).toEqual({ error: 'INVALID_MESSAGE' });
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('returns an error ack (not a thrown exception) when the service refuses', async () => {
    chat.sendMessage.mockRejectedValueOnce(new AuthorizationError());
    const ack = await gateway.onMessageSend(connected() as unknown as Socket, { conversationId: CONV, body: 'x' });
    expect(ack).toEqual({ error: 'FORBIDDEN' });
    expect(serverEmit).not.toHaveBeenCalled();
  });

  it('rate-limits message bursts', async () => {
    const socket = connected();
    const burst = RATE_LIMITS.message[0].max;
    for (let i = 0; i < burst; i++) {
      expect(await gateway.onMessageSend(socket as unknown as Socket, { conversationId: CONV, body: `m${i}` })).toMatchObject({ ok: true });
    }
    expect(await gateway.onMessageSend(socket as unknown as Socket, { conversationId: CONV, body: 'one too many' })).toEqual({ error: 'RATE_LIMITED' });
  });

  it('ignores typing for conversations the socket is not in', async () => {
    const socket = connected();
    await gateway.onTyping(socket as unknown as Socket, { conversationId: '22222222-2222-4222-8222-222222222222', isTyping: true });
    expect(socket.to).not.toHaveBeenCalled();
    await gateway.onTyping(socket as unknown as Socket, { conversationId: CONV, isTyping: true });
    expect(socket.toEmit).toHaveBeenCalledWith('typing', { conversationId: CONV, userId: CLIENT, isTyping: true });
  });

  it('acks reads to the other participant', async () => {
    const socket = connected();
    await gateway.onRead(socket as unknown as Socket, { conversationId: CONV });
    expect(socket.toEmit).toHaveBeenCalledWith('read:ack', { conversationId: CONV, readerId: CLIENT, messageIds: ['m0'] });
  });

  it('ignores presence entries whose lease expired (e.g. a crashed replica)', async () => {
    await redis.zadd(`chat:presence:${MANAGER}`, Date.now() - 1, 'dead-sock');
    const socket = fakeSocket(clientToken());
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.emitted.find((e) => e.event === 'presence:update')).toBeUndefined();
  });

  it('removes the socket and announces offline on the last disconnect', async () => {
    await redis.zadd(`chat:presence:${CLIENT}`, Date.now() + 60_000, 'sock-1');
    const socket = connected();
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(redis.zsets.get(`chat:presence:${CLIENT}`)?.size).toBe(0);
    expect(socket.toEmit).toHaveBeenCalledWith('presence:update', { userId: CLIENT, online: false });
  });
});
