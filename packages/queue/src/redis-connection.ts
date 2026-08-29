import IORedis, { type RedisOptions } from 'ioredis';

/**
 * `maxRetriesPerRequest: null` is a hard BullMQ requirement (it manages its own
 * blocking-command retry behavior) — omitting it causes BullMQ to eventually
 * throw on reconnect. Works unchanged against local Redis or Upstash
 * (`rediss://` TLS URLs) — only REDIS_URL changes between environments.
 */
export function createRedisConnection(url: string, extra: RedisOptions = {}): IORedis {
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 5000,
    ...extra,
  });

  // ioredis prints "Unhandled error event" straight to the console if nothing
  // is listening on 'error' — it still retries/reconnects on its own either
  // way, but callers should route this through structured logging instead of
  // raw console output. This no-op listener just stops the console spam;
  // apps that want the events attach their own listener (see apps/api's
  // RedisModule for the structured-logging version).
  connection.on('error', () => {});

  return connection;
}
