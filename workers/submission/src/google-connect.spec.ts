import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type * as Providers from '@foxindex/providers';

const refreshGoogleAccessToken = vi.fn();
vi.mock('@foxindex/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof Providers>()),
  refreshGoogleAccessToken: (...a: unknown[]) => refreshGoogleAccessToken(...a),
}));

const { createLogger } = await import('@foxindex/logger');
const { createDbClient, googleConnections, googleServiceAccounts, indexingProviders, notifications, sites, submissionBatches, urlSubmissions, urls, users } = await import('@foxindex/database');
const { encryptSecret, GoogleOAuthError } = await import('@foxindex/providers');
const { processBatch } = await import('./batch-processor');

const DATABASE_URL = process.env.DATABASE_URL;
const KEY = 'test-encryption-key-0123456789abcdef';

describe.skipIf(!DATABASE_URL)('Google submission through "Connect Google" (Postgres)', () => {
  const { db, pool } = createDbClient({ connectionString: DATABASE_URL ?? '' });
  const userId = randomUUID();
  let siteId = '';
  let googleId = '';
  let saId = '';
  let connId = '';
  const viaToken: string[] = [];
  const viaAccount: string[] = [];
  const store = new Map<string, string>();
  const redis = {
    incr: async (k: string) => { const v = Number(store.get(k) ?? 0) + 1; store.set(k, String(v)); return v; },
    decr: async (k: string) => { const v = Number(store.get(k) ?? 0) - 1; store.set(k, String(v)); return v; },
    expire: async () => 1,
    set: async (k: string, v: string) => (store.set(k, v), 'OK'),
  };
  const deps = () => ({
    db,
    redis: redis as never,
    encryptionKey: KEY,
    logger: createLogger('gconnect-test', 'silent'),
    googleOAuth: { clientId: 'cid', clientSecret: 'secret' },
    google: {
      publish: async (url: string) => (viaAccount.push(url), { kind: 'ok' as const, status: 200 }),
      publishWithToken: async (url: string, token: string) => (viaToken.push(`${url}|${token}`), { kind: 'ok' as const, status: 200 }),
    },
    indexNow: () => ({ submit: async () => ({ success: true, acceptedUrls: [], rejectedUrls: [], retryable: false }) }),
  });

  async function batchFor(path: string) {
    const [b] = await db.insert(submissionBatches).values({ userId, name: `T ${randomUUID().slice(0, 6)}`, urlCount: 1 }).returning();
    const [u] = await db.insert(urls).values({ siteId, userId, url: path, normalizedUrl: `${path}#${randomUUID()}` }).returning();
    await db.insert(urlSubmissions).values({ urlId: u.id, userId, providerId: googleId, batchId: b.id, creditCost: 1 });
    return b.id;
  }

  beforeAll(async () => {
    await db.insert(users).values({ id: userId, name: 'Connect Test', email: `gc-${userId}@example.com`, passwordHash: 'x', role: 'client', status: 'active' });
    const [site] = await db.insert(sites).values({ userId, domain: 'owned-site.example', indexnowKey: 'c'.repeat(32) }).returning();
    siteId = site.id;
    const [g] = await db.insert(indexingProviders).values({ kind: 'google_indexing', label: 'GC Google', isActive: false }).returning();
    googleId = g.id;
    const [sa] = await db.insert(googleServiceAccounts).values({ label: 'GC SA', clientEmail: `gc-${userId}@test.iam`, privateKeyEncrypted: encryptSecret('fake', KEY), gcpProjectId: 't', isActive: true, dailyQuota: 50 }).returning();
    saId = sa.id;
    const [c] = await db
      .insert(googleConnections)
      .values({ userId, googleEmail: 'owner@owned-site.example', refreshTokenEncrypted: encryptSecret('refresh-1', KEY), properties: [{ siteUrl: 'sc-domain:owned-site.example', permissionLevel: 'siteOwner' }] })
      .returning();
    connId = c.id;
  });

  beforeEach(() => {
    viaToken.length = 0;
    viaAccount.length = 0;
    store.clear();
    refreshGoogleAccessToken.mockReset().mockResolvedValue({ accessToken: 'customer-token', expiresIn: 3600 });
  });

  afterAll(async () => {
    const batchIds = (await db.select({ id: submissionBatches.id }).from(submissionBatches).where(eq(submissionBatches.userId, userId))).map((b) => b.id);
    if (batchIds.length) await db.delete(urlSubmissions).where(inArray(urlSubmissions.batchId, batchIds));
    await db.delete(urls).where(eq(urls.userId, userId));
    await db.delete(submissionBatches).where(eq(submissionBatches.userId, userId));
    await db.delete(googleConnections).where(eq(googleConnections.userId, userId));
    await db.delete(notifications).where(eq(notifications.userId, userId));
    await db.delete(sites).where(eq(sites.userId, userId));
    await db.delete(googleServiceAccounts).where(eq(googleServiceAccounts.id, saId));
    await db.delete(indexingProviders).where(eq(indexingProviders.id, googleId));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it("uses the customer's own Google access for a site they own — no service account involved", async () => {
    const batchId = await batchFor('https://blog.owned-site.example/post-1');
    const r = await processBatch(deps(), batchId, { finalAttempt: false });
    expect(r).toMatchObject({ submitted: 1, failed: 0 });
    expect(viaToken).toEqual(['https://blog.owned-site.example/post-1|customer-token']);
    expect(viaAccount).toHaveLength(0);
    expect(refreshGoogleAccessToken).toHaveBeenCalledWith({ clientId: 'cid', clientSecret: 'secret' }, 'refresh-1');
  });

  it('falls back to FoxIndex service accounts for sites the customer did not connect', async () => {
    const batchId = await batchFor('https://someone-else.example/page');
    await processBatch(deps(), batchId, { finalAttempt: false });
    expect(viaToken).toHaveLength(0);
    expect(viaAccount).toEqual(['https://someone-else.example/page']);
  });

  it('marks the connection when the customer removed access, and still submits another way', async () => {
    refreshGoogleAccessToken.mockRejectedValue(new GoogleOAuthError(400, 'invalid_grant', 'Token has been expired or revoked.'));
    const batchId = await batchFor('https://owned-site.example/after-revoke');
    await processBatch(deps(), batchId, { finalAttempt: false });
    expect(viaAccount).toEqual(['https://owned-site.example/after-revoke']);
    const [c] = await db.select().from(googleConnections).where(eq(googleConnections.id, connId));
    expect(c.status).toBe('revoked');
    expect(c.lastError).toContain('connect Google again');
  });
});
