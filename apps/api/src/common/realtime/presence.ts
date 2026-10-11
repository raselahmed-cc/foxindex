import type IORedis from 'ioredis';

/**
 * Presence as a per-user sorted set of socket ids scored by expiry time.
 * Live sockets are refreshed by a heartbeat, so a crashed or restarted API
 * replica can never leave a user "online" — its entries simply age out.
 */
export const PRESENCE_TTL_MS = 90_000;
export const PRESENCE_HEARTBEAT_MS = 30_000;

export const presenceKey = (userId: string) => `chat:presence:${userId}`;

/** Live socket count for the user after pruning expired entries. */
async function liveCount(redis: IORedis, key: string, now: number): Promise<number> {
  await redis.zremrangebyscore(key, '-inf', now);
  return redis.zcount(key, now, '+inf');
}

/** Registers a socket; returns the user's live socket count afterwards. */
export async function addPresence(redis: IORedis, userId: string, socketId: string, now = Date.now()): Promise<number> {
  const key = presenceKey(userId);
  await redis.zadd(key, now + PRESENCE_TTL_MS, socketId);
  await redis.pexpire(key, PRESENCE_TTL_MS);
  return liveCount(redis, key, now);
}

/** Unregisters a socket; returns how many live sockets the user still has. */
export async function removePresence(redis: IORedis, userId: string, socketId: string, now = Date.now()): Promise<number> {
  const key = presenceKey(userId);
  await redis.zrem(key, socketId);
  return liveCount(redis, key, now);
}

/** Extends every given socket's lease in one round trip. */
export async function refreshPresence(redis: IORedis, entries: { userId: string; socketId: string }[], now = Date.now()): Promise<void> {
  if (!entries.length) return;
  const pipeline = redis.pipeline();
  for (const { userId, socketId } of entries) {
    pipeline.zadd(presenceKey(userId), now + PRESENCE_TTL_MS, socketId);
    pipeline.pexpire(presenceKey(userId), PRESENCE_TTL_MS);
  }
  await pipeline.exec();
}

/** Which of the given users currently have at least one live socket. */
export async function onlineUsers(redis: IORedis, userIds: string[], now = Date.now()): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const pipeline = redis.pipeline();
  for (const id of userIds) pipeline.zcount(presenceKey(id), now, '+inf');
  const results = (await pipeline.exec()) ?? [];
  return new Set(userIds.filter((_, i) => Number(results[i]?.[1] ?? 0) > 0));
}
