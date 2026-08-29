import type { Provider } from '@nestjs/common';
import type IORedis from 'ioredis';
import { IdempotencyCache } from '@foxindex/queue';
import { REDIS_CONNECTION } from '../../redis/redis.module';

export const IDEMPOTENCY_CACHE = Symbol('IDEMPOTENCY_CACHE');

export const idempotencyCacheProvider: Provider = {
  provide: IDEMPOTENCY_CACHE,
  inject: [REDIS_CONNECTION],
  // A real IORedis instance structurally satisfies IdempotencyCache's narrow
  // IdempotencyRedisClient interface — no adapter needed.
  useFactory: (redis: IORedis): IdempotencyCache => new IdempotencyCache(redis),
};
