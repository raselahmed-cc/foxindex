/**
 * The minimal Redis surface IdempotencyCache needs — deliberately narrower than
 * the full IORedis type so it's trivially testable with an in-memory fake
 * instead of a mock Redis library (ioredis-mock's peer range only covers
 * ioredis ^5, and we're on 6). A real IORedis instance satisfies this
 * structurally with no adapter needed.
 */
export interface IdempotencyRedisClient {
  set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
    flag: 'NX',
  ): Promise<'OK' | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<'OK' | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

export interface IdempotencyCacheOptions {
  /** How long a completed response stays cached and can be replayed. */
  responseTtlSeconds?: number;
  /** How long an in-flight lock holds before it's considered abandoned. */
  lockTtlSeconds?: number;
}

type CacheEntry = { state: 'pending' } | { state: 'done'; response: unknown };

export type IdempotencyBeginResult =
  | { status: 'proceed' }
  | { status: 'in-flight' }
  | { status: 'cached'; response: unknown };

const DEFAULT_RESPONSE_TTL_SECONDS = 86400;
const DEFAULT_LOCK_TTL_SECONDS = 30;

/**
 * Backs the `Idempotency-Key` header on mutating endpoints (constitution §18),
 * e.g. `POST /projects/:id/submissions`. A client retry that reuses the same key
 * either proceeds (first attempt), gets told to back off (a concurrent attempt
 * is still running), or receives the exact prior response replayed — never a
 * second side effect.
 */
export class IdempotencyCache {
  private readonly responseTtlSeconds: number;
  private readonly lockTtlSeconds: number;

  constructor(
    private readonly redis: IdempotencyRedisClient,
    options: IdempotencyCacheOptions = {},
  ) {
    this.responseTtlSeconds = options.responseTtlSeconds ?? DEFAULT_RESPONSE_TTL_SECONDS;
    this.lockTtlSeconds = options.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;
  }

  private cacheKey(userId: string, idempotencyKey: string): string {
    return `idempotency:${userId}:${idempotencyKey}`;
  }

  async begin(userId: string, idempotencyKey: string): Promise<IdempotencyBeginResult> {
    const key = this.cacheKey(userId, idempotencyKey);
    const acquired = await this.redis.set(
      key,
      JSON.stringify({ state: 'pending' } satisfies CacheEntry),
      'EX',
      this.lockTtlSeconds,
      'NX',
    );
    if (acquired === 'OK') {
      return { status: 'proceed' };
    }

    const existing = await this.redis.get(key);
    if (!existing) {
      // The lock expired between our failed NX and this GET (abandoned request) —
      // treat as a fresh attempt rather than blocking forever.
      return { status: 'proceed' };
    }

    const entry = JSON.parse(existing) as CacheEntry;
    if (entry.state === 'pending') {
      return { status: 'in-flight' };
    }
    return { status: 'cached', response: entry.response };
  }

  async complete(userId: string, idempotencyKey: string, response: unknown): Promise<void> {
    const key = this.cacheKey(userId, idempotencyKey);
    await this.redis.set(
      key,
      JSON.stringify({ state: 'done', response } satisfies CacheEntry),
      'EX',
      this.responseTtlSeconds,
    );
  }

  /** Called on failure so a retry isn't stuck behind a dead lock until it expires. */
  async release(userId: string, idempotencyKey: string): Promise<void> {
    await this.redis.del(this.cacheKey(userId, idempotencyKey));
  }
}
