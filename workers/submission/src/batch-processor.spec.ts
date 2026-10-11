import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createLogger } from '@foxindex/logger';
import {
  createDbClient,
  creditTransactions,
  googleServiceAccounts,
  indexingProviders,
  notifications,
  sites,
  submissionBatches,
  urlSubmissions,
  urls,
  users,
} from '@foxindex/database';
import { encryptSecret, type GooglePublishOutcome, type SubmissionResult } from '@foxindex/providers';
import { MAX_URL_ATTEMPTS, msUntilQuotaReset, processBatch, type ProcessorDeps } from './batch-processor';

/**
 * Runs against a real Postgres (the migrated dev/CI database) with fake
 * engines — no network. Skipped when DATABASE_URL isn't set.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const KEY = 'test-encryption-key-0123456789abcdef';

/** Minimal in-memory Redis for counters and NX flags. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    incr: async (k: string) => {
      const v = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(v));
      return v;
    },
    decr: async (k: string) => {
      const v = Number(store.get(k) ?? 0) - 1;
      store.set(k, String(v));
      return v;
    },
    expire: async () => 1,
    set: async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
  };
}

describe('msUntilQuotaReset', () => {
  it('waits until just after the next UTC midnight', () => {
    expect(msUntilQuotaReset(new Date('2026-10-11T23:00:00Z'))).toBe(65 * 60_000);
  });
});

describe.skipIf(!DATABASE_URL)('processBatch (Postgres)', () => {
  const { db, pool } = createDbClient({ connectionString: DATABASE_URL ?? '' });
  const userId = randomUUID();
  let googleId = '';
  let indexNowId = '';
  let siteId = '';
  let saId = '';
  const createdProviders: string[] = [];

  let googleScript: (url: string) => GooglePublishOutcome;
  let indexNowResult: SubmissionResult;
  let redis: ReturnType<typeof fakeRedis>;

  const deps = (): ProcessorDeps => ({
    db,
    redis: redis as never,
    encryptionKey: KEY,
    logger: createLogger('worker-test', 'silent'),
    google: { publish: async (url) => googleScript(url) },
    indexNow: () => ({ submit: async () => indexNowResult }),
  });

  async function makeBatch(n: number, opts: { google?: boolean; indexnow?: boolean; cost?: number } = { google: true }) {
    const [batch] = await db
      .insert(submissionBatches)
      .values({ userId, name: `Test ${randomUUID().slice(0, 6)}`, urlCount: n, creditsCharged: n * (opts.cost ?? 1), notifyWhenDone: true })
      .returning();
    const urlRows = await db
      .insert(urls)
      .values(Array.from({ length: n }, (_, i) => ({ siteId, userId, url: `https://worker-test.example/${batch.id}/${i}`, normalizedUrl: `https://worker-test.example/${batch.id}/${i}` })))
      .returning();
    const subs = [];
    for (const u of urlRows) {
      if (opts.google !== false) subs.push({ urlId: u.id, userId, providerId: googleId, batchId: batch.id, creditCost: opts.cost ?? 1 });
      if (opts.indexnow) subs.push({ urlId: u.id, userId, providerId: indexNowId, batchId: batch.id, creditCost: 0 });
    }
    await db.insert(urlSubmissions).values(subs);
    return batch.id;
  }

  const statuses = async (batchId: string) =>
    (await db.select({ status: urlSubmissions.status, attempts: urlSubmissions.attempts, lastError: urlSubmissions.lastError }).from(urlSubmissions).where(eq(urlSubmissions.batchId, batchId)));

  beforeAll(async () => {
    await db.insert(users).values({ id: userId, name: 'Worker Test', email: `worker-${userId}@example.com`, passwordHash: 'x', role: 'client', status: 'active', creditBalanceCached: 100 });
    const [site] = await db.insert(sites).values({ userId, domain: 'worker-test.example', indexnowKey: 'a'.repeat(32) }).returning();
    siteId = site.id;
    const [g] = await db.insert(indexingProviders).values({ kind: 'google_indexing', label: 'Test Google', isActive: false }).returning();
    const [i] = await db.insert(indexingProviders).values({ kind: 'indexnow', label: 'Test IndexNow', isActive: false }).returning();
    googleId = g.id;
    indexNowId = i.id;
    createdProviders.push(g.id, i.id);
    const [sa] = await db
      .insert(googleServiceAccounts)
      .values({ label: 'Test SA', clientEmail: `sa-${userId}@test.iam`, privateKeyEncrypted: encryptSecret('fake-key', KEY), gcpProjectId: 'test', dailyQuota: 3, isActive: true })
      .returning();
    saId = sa.id;
  });

  beforeEach(() => {
    redis = fakeRedis();
    googleScript = () => ({ kind: 'ok', status: 200 });
    indexNowResult = { success: true, acceptedUrls: [], rejectedUrls: [], retryable: false };
  });

  afterAll(async () => {
    const batchIds = (await db.select({ id: submissionBatches.id }).from(submissionBatches).where(eq(submissionBatches.userId, userId))).map((b) => b.id);
    if (batchIds.length) await db.delete(urlSubmissions).where(inArray(urlSubmissions.batchId, batchIds));
    await db.delete(urls).where(eq(urls.userId, userId));
    await db.delete(submissionBatches).where(eq(submissionBatches.userId, userId));
    await db.delete(notifications).where(eq(notifications.userId, userId));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, userId));
    await db.delete(sites).where(eq(sites.userId, userId));
    await db.delete(googleServiceAccounts).where(eq(googleServiceAccounts.id, saId));
    await db.delete(indexingProviders).where(inArray(indexingProviders.id, createdProviders));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it('submits to Google and IndexNow and notifies once when done', async () => {
    const batchId = await makeBatch(2, { google: true, indexnow: true });
    const r = await processBatch(deps(), batchId, { finalAttempt: false });
    expect(r).toMatchObject({ submitted: 4, failed: 0, retrying: 0, done: true });
    expect((await statuses(batchId)).every((s) => s.status === 'submitted' && s.attempts === 1)).toBe(true);
    await processBatch(deps(), batchId, { finalAttempt: false });
    const notes = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(notes.filter((n) => n.type === 'batch.done')).toHaveLength(1);
  });

  it('retries transient errors, then fails and refunds on the final attempt', async () => {
    const batchId = await makeBatch(2, { cost: 2 });
    googleScript = () => ({ kind: 'retryable', status: 503, message: 'Backend unavailable' });
    const first = await processBatch(deps(), batchId, { finalAttempt: false });
    expect(first).toMatchObject({ retrying: 2, done: false, refunded: 0 });
    expect((await statuses(batchId)).every((s) => s.status === 'retrying' && s.lastError?.includes('Backend unavailable'))).toBe(true);

    const [before] = await db.select({ b: users.creditBalanceCached }).from(users).where(eq(users.id, userId));
    const last = await processBatch(deps(), batchId, { finalAttempt: true });
    expect(last).toMatchObject({ failed: 2, refunded: 4, done: true });
    const [after] = await db.select({ b: users.creditBalanceCached }).from(users).where(eq(users.id, userId));
    expect(after.b - before.b).toBe(4);
    // Running again must not refund twice.
    expect((await processBatch(deps(), batchId, { finalAttempt: true })).refunded).toBe(0);
  });

  it('gives up after MAX_URL_ATTEMPTS even before the job runs out', async () => {
    const batchId = await makeBatch(1);
    await db.update(urlSubmissions).set({ attempts: MAX_URL_ATTEMPTS - 1, status: 'retrying' }).where(eq(urlSubmissions.batchId, batchId));
    googleScript = () => ({ kind: 'retryable', status: null, message: 'timeout' });
    expect(await processBatch(deps(), batchId, { finalAttempt: false })).toMatchObject({ failed: 1, retrying: 0 });
  });

  it('fails a URL whose site no service account owns', async () => {
    const batchId = await makeBatch(1);
    googleScript = () => ({ kind: 'permission_denied', status: 403, message: 'Failed to verify the URL ownership.' });
    await processBatch(deps(), batchId, { finalAttempt: false });
    const [s] = await statuses(batchId);
    expect(s.status).toBe('failed');
    expect(s.lastError).toContain('owner of this site');
  });

  it('waits (without spending attempts) when Google quota is exhausted', async () => {
    const batchId = await makeBatch(5);
    const r = await processBatch(deps(), batchId, { finalAttempt: false });
    // dailyQuota is 3 for the test account.
    expect(r).toMatchObject({ submitted: 3, waitingForQuota: 2, done: false });
    const pending = (await statuses(batchId)).filter((s) => s.status === 'queued');
    expect(pending).toHaveLength(2);
    expect(pending.every((s) => s.attempts === 0 && s.lastError?.includes('quota'))).toBe(true);
  });

  it('marks IndexNow rejections failed without refunds (IndexNow is free)', async () => {
    const batchId = await makeBatch(1, { google: false, indexnow: true });
    indexNowResult = { success: false, acceptedUrls: [], rejectedUrls: [], errorCode: 'PROVIDER_ERROR', errorMessage: 'Key not found at keyLocation', retryable: false };
    const r = await processBatch(deps(), batchId, { finalAttempt: false });
    expect(r).toMatchObject({ failed: 1, refunded: 0, done: true });
  });
});
