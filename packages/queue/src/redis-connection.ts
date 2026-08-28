import IORedis, { type RedisOptions } from 'ioredis';

/**
 * `maxRetriesPerRequest: null` is a hard BullMQ requirement (it manages its own
 * blocking-command retry behavior) — omitting it causes BullMQ to eventually
 * throw on reconnect. Works unchanged against local Redis or Upstash
 * (`rediss://` TLS URLs) — only REDIS_URL changes between environments.
 */
export function createRedisConnection(url: string, extra: RedisOptions = {}): IORedis {
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...extra,
  });
}
