import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createLogger } from '@foxindex/logger';
import { createDbClient, googleServiceAccounts, indexChecks, indexingProviders, sites, urlSubmissions, urls, users } from '@foxindex/database';
import { encryptSecret, type GoogleInspectOutcome } from '@foxindex/providers';
import { candidateProperties, runIndexChecks, statusFor, type IndexCheckDeps } from './index-checker';

const DATABASE_URL = process.env.DATABASE_URL;
const KEY = 'test-encryption-key-0123456789abcdef';

describe('index checker helpers', () => {
  it('tries the domain property, then URL-prefix properties', () => {
    expect(candidateProperties('https://www.shop.example/p/1', 'shop.example', null)).toEqual(['sc-domain:shop.example', 'https://www.shop.example/', 'http://www.shop.example/']);
    expect(candidateProperties('https://shop.example/p/1', 'shop.example', 'https://shop.example/')).toEqual(['https://shop.example/']);
  });

  it('maps Google verdicts', () => {
    expect(statusFor('PASS', 'Submitted and indexed')).toBe('indexed');
    expect(statusFor('NEUTRAL', 'Crawled - currently not indexed')).toBe('crawled_not_indexed');
    expect(statusFor('NEUTRAL', 'URL is unknown to Google')).toBe('not_indexed');
  });
});

describe.skipIf(!DATABASE_URL)('runIndexChecks (Postgres)', () => {
  const { db, pool } = createDbClient({ connectionString: DATABASE_URL ?? '' });
  const userId = randomUUID();
  let siteId = '';
  let providerId = '';
  let saId = '';
  let script: (url: string, property: string) => GoogleInspectOutcome;
  const calls: { url: string; property: string }[] = [];
  const store = new Map<string, string>();
  const redis = {
    incr: async (k: string) => { const v = Number(store.get(k) ?? 0) + 1; store.set(k, String(v)); return v; },
    decr: async (k: string) => { const v = Number(store.get(k) ?? 0) - 1; store.set(k, String(v)); return v; },
    expire: async () => 1,
  };
  const now = new Date('2026-11-10T12:00:00Z');
  const deps = (): IndexCheckDeps => ({
    db,
    redis: redis as never,
    encryptionKey: KEY,
    logger: createLogger('index-check-test', 'silent'),
    now: () => now,
    google: { inspect: async (url, property) => (calls.push({ url, property }), script(url, property)) },
  });

  async function makeUrl(path: string, checkCount = 0) {
    const [u] = await db
      .insert(urls)
      .values({ siteId, userId, url: `https://idx-test.example/${path}`, normalizedUrl: `https://idx-test.example/${path}-${randomUUID()}`, // Due long ago, so it sorts ahead of any other due URL in this database.
        nextIndexCheckAt: new Date(0), indexCheckCount: checkCount })
      .returning();
    await db.insert(urlSubmissions).values({ urlId: u.id, userId, providerId, status: 'submitted' });
    return u.id;
  }
  const urlRow = async (id: string) => (await db.select().from(urls).where(eq(urls.id, id)))[0];
  const subStatus = async (id: string) => (await db.select({ s: urlSubmissions.status }).from(urlSubmissions).where(eq(urlSubmissions.urlId, id)))[0].s;

  beforeAll(async () => {
    await db.insert(users).values({ id: userId, name: 'Index Test', email: `idx-${userId}@example.com`, passwordHash: 'x', role: 'client', status: 'active' });
    const [site] = await db.insert(sites).values({ userId, domain: 'idx-test.example', indexnowKey: 'b'.repeat(32) }).returning();
    siteId = site.id;
    const [p] = await db.insert(indexingProviders).values({ kind: 'google_indexing', label: 'Idx Google', isActive: false }).returning();
    providerId = p.id;
    const [sa] = await db.insert(googleServiceAccounts).values({ label: 'Idx SA', clientEmail: `idx-${userId}@test.iam`, privateKeyEncrypted: encryptSecret('fake', KEY), gcpProjectId: 't', isActive: true }).returning();
    saId = sa.id;
  });

  beforeEach(async () => {
    calls.length = 0;
    store.clear();
    await db.update(sites).set({ gscProperty: null }).where(eq(sites.id, siteId));
  });

  afterAll(async () => {
    const ids = (await db.select({ id: urls.id }).from(urls).where(eq(urls.userId, userId))).map((r) => r.id);
    if (ids.length) {
      await db.delete(indexChecks).where(inArray(indexChecks.urlId, ids));
      await db.delete(urlSubmissions).where(inArray(urlSubmissions.urlId, ids));
      await db.delete(urls).where(inArray(urls.id, ids));
    }
    await db.delete(sites).where(eq(sites.id, siteId));
    await db.delete(googleServiceAccounts).where(eq(googleServiceAccounts.id, saId));
    await db.delete(indexingProviders).where(eq(indexingProviders.id, providerId));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it('marks an indexed URL, stops checking it and remembers the working property', async () => {
    const id = await makeUrl('a');
    script = (_u, prop) => (prop.startsWith('sc-domain:') ? { kind: 'permission_denied', status: 403, message: 'not owner' } : { kind: 'ok', verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: '2026-11-09T08:00:00Z', raw: {} });
    const run = await runIndexChecks(deps(), 1);
    expect(run).toMatchObject({ checked: 1, indexed: 1 });
    const u = await urlRow(id);
    expect(u).toMatchObject({ indexStatus: 'indexed', indexCoverage: 'Submitted and indexed', nextIndexCheckAt: null, indexCheckCount: 1 });
    expect(u.indexedAt).not.toBeNull();
    expect(await subStatus(id)).toBe('indexed');
    const [site] = await db.select({ p: sites.gscProperty }).from(sites).where(eq(sites.id, siteId));
    expect(site.p).toBe('https://idx-test.example/');
    expect(await db.select().from(indexChecks).where(eq(indexChecks.urlId, id))).toHaveLength(1);
  });

  it('schedules the next check when not indexed yet, and gives up after the 7-day check', async () => {
    script = () => ({ kind: 'ok', verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed', lastCrawlTime: null, raw: {} });
    const first = await makeUrl('b');
    await runIndexChecks(deps(), 1);
    const u = await urlRow(first);
    expect(u).toMatchObject({ indexStatus: 'crawled_not_indexed', indexCheckCount: 1 });
    expect(u.nextIndexCheckAt?.getTime()).toBe(now.getTime() + 18 * 3_600_000);
    expect(await subStatus(first)).toBe('submitted');

    const last = await makeUrl('c', 3);
    await runIndexChecks(deps(), 1);
    expect(await urlRow(last)).toMatchObject({ nextIndexCheckAt: null, indexCheckCount: 4 });
    expect(await subStatus(last)).toBe('not_indexed');
  });

  it('explains when FoxIndex has no Search Console access, and tries again later', async () => {
    script = () => ({ kind: 'permission_denied', status: 403, message: 'You do not own this site' });
    const id = await makeUrl('d');
    const run = await runIndexChecks(deps(), 1);
    expect(run.noAccess).toBe(1);
    const u = await urlRow(id);
    expect(u.indexStatus).toBe('unknown');
    expect(u.indexNote).toContain('Owner');
    expect(u.nextIndexCheckAt?.getTime()).toBe(now.getTime() + 24 * 3_600_000);
    // Every account gets all three property types (any account might be the site's owner).
    expect(calls.slice(0, 3).map((c) => c.property)).toEqual(['sc-domain:idx-test.example', 'https://idx-test.example/', 'http://idx-test.example/']);
    expect(calls.length % 3).toBe(0);
  });

  it('retries in an hour when Google is temporarily unavailable', async () => {
    script = () => ({ kind: 'retryable', status: 503, message: 'Backend error' });
    const id = await makeUrl('e');
    expect((await runIndexChecks(deps(), 1)).retryLater).toBe(1);
    const u = await urlRow(id);
    expect(u.indexCheckCount).toBe(0);
    expect(u.nextIndexCheckAt?.getTime()).toBe(now.getTime() + 3_600_000);
  });
});
