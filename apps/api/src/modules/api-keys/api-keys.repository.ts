import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type IORedis from 'ioredis';
import type { Database } from '@foxindex/database';
import { apiKeys, sites } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';

const USAGE_TTL_SECONDS = 40 * 24 * 60 * 60;

function dayKey(keyId: string, date: Date): string {
  return `apikey:req:${keyId}:${date.toISOString().slice(0, 10)}`;
}

@Injectable()
export class ApiKeysRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  async create(values: typeof apiKeys.$inferInsert) {
    const [row] = await this.db.insert(apiKeys).values(values).returning();
    return row;
  }

  listForUser(userId: string) {
    return this.db
      .select({ key: apiKeys, siteDomain: sites.domain })
      .from(apiKeys)
      .leftJoin(sites, eq(sites.id, apiKeys.siteId))
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
  }

  findForUser(userId: string, keyId: string) {
    return this.db.query.apiKeys.findFirst({ where: and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)) });
  }

  findActiveByHash(keyHash: string) {
    return this.db.query.apiKeys.findFirst({ where: and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)) });
  }

  async update(keyId: string, values: Partial<typeof apiKeys.$inferInsert>) {
    const [row] = await this.db.update(apiKeys).set(values).where(eq(apiKeys.id, keyId)).returning();
    return row;
  }

  async siteBelongsToUser(siteId: string, userId: string): Promise<boolean> {
    const row = await this.db.query.sites.findFirst({ where: and(eq(sites.id, siteId), eq(sites.userId, userId)), columns: { id: true } });
    return Boolean(row);
  }

  /** Fire-and-forget from the guard — never blocks the request on these writes. */
  async recordUse(keyId: string): Promise<void> {
    const key = dayKey(keyId, new Date());
    await this.redis.multi().incr(key).expire(key, USAGE_TTL_SECONDS).exec();
    await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
  }

  /** Daily request counts, oldest first, for the last `days` days. */
  async dailyUsage(keyIds: string[], days = 7): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    if (keyIds.length === 0) return result;
    const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 86_400_000));
    const keys = keyIds.flatMap((id) => dates.map((d) => dayKey(id, d)));
    const values = await this.redis.mget(keys);
    keyIds.forEach((id, i) => {
      result.set(id, values.slice(i * days, (i + 1) * days).map((v) => Number(v ?? 0)));
    });
    return result;
  }

  async monthlyRequests(keyIds: string[]): Promise<number> {
    const usage = await this.dailyUsage(keyIds, new Date().getUTCDate());
    let total = 0;
    usage.forEach((counts) => counts.forEach((n) => (total += n)));
    return total;
  }
}
