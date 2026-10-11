import { beforeEach, describe, expect, it } from 'vitest';
import { IdempotencyCache, type IdempotencyRedisClient } from './idempotency-cache';

/** Minimal in-memory stand-in for the narrow Redis surface IdempotencyCache needs. */
class FakeRedis implements IdempotencyRedisClient {
  private readonly store = new Map<string, string>();

  async set(
    key: string,
    value: string,
    _mode: 'EX',
    _ttlSeconds: number,
    flag?: 'NX',
  ): Promise<'OK' | null> {
    if (flag === 'NX' && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('IdempotencyCache', () => {
  let redis: FakeRedis;
  let cache: IdempotencyCache;

  beforeEach(() => {
    redis = new FakeRedis();
    cache = new IdempotencyCache(redis);
  });

  it('lets the first request with a given key proceed', async () => {
    const result = await cache.begin('user_1', 'key_1');
    expect(result).toEqual({ status: 'proceed' });
  });

  it('reports a second concurrent request with the same key as in-flight', async () => {
    await cache.begin('user_1', 'key_1');
    const second = await cache.begin('user_1', 'key_1');
    expect(second).toEqual({ status: 'in-flight' });
  });

  it('replays the cached response once the first request completes', async () => {
    await cache.begin('user_1', 'key_1');
    await cache.complete('user_1', 'key_1', { submissionId: 'sub_123' });

    const replay = await cache.begin('user_1', 'key_1');
    expect(replay).toEqual({ status: 'cached', response: { submissionId: 'sub_123' } });
  });

  it('scopes keys per user — different users with the same key do not collide', async () => {
    await cache.begin('user_1', 'key_1');
    const otherUser = await cache.begin('user_2', 'key_1');
    expect(otherUser).toEqual({ status: 'proceed' });
  });

  it('release() clears the lock so a retry after failure is treated as fresh', async () => {
    await cache.begin('user_1', 'key_1');
    await cache.release('user_1', 'key_1');

    const retry = await cache.begin('user_1', 'key_1');
    expect(retry).toEqual({ status: 'proceed' });
  });

  it('treats a missing key on GET (lock expired mid-check) as proceed rather than hanging', async () => {
    // Simulate the TTL race: NX fails, but by the time we GET, the key is gone.
    const racyRedis: IdempotencyRedisClient = {
      set: async (_key, _value, _mode, _ttl, flag) => (flag === 'NX' ? null : 'OK'),
      get: async () => null,
      del: async () => 0,
    };
    const racyCache = new IdempotencyCache(racyRedis);
    const result = await racyCache.begin('user_1', 'key_1');
    expect(result).toEqual({ status: 'proceed' });
  });
});
