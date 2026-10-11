import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type IORedis from 'ioredis';
import type { Logger } from '@foxindex/logger';
import {
  creditTransactions,
  googleServiceAccounts,
  indexingProviders,
  notifications,
  sites,
  submissionBatches,
  urlSubmissions,
  urls,
  users,
  type Database,
} from '@foxindex/database';
import { decryptSecret, type GoogleIndexingClient, type GoogleServiceAccount, type IndexNowProvider } from '@foxindex/providers';

/** Per-URL tries before a submission is given up (and its credits refunded). */
export const MAX_URL_ATTEMPTS = 6;
/** IndexNow accepts up to 10,000 URLs per request. */
const INDEXNOW_CHUNK = 10_000;
const GOOGLE_CONCURRENCY = 4;
const PENDING = ['queued', 'retrying'] as const;

export interface ProcessorDeps {
  db: Database;
  redis: IORedis;
  /** Factory so a provider row's `submitEndpoint` override is honoured. */
  indexNow: (endpoint?: string) => Pick<IndexNowProvider, 'submit'>;
  google: Pick<GoogleIndexingClient, 'publish'>;
  encryptionKey: string;
  logger: Logger;
  now?: () => Date;
}

export interface BatchRunResult {
  submitted: number;
  failed: number;
  retrying: number;
  /** Google rows left queued because every service account is out of quota (or none exist). */
  waitingForQuota: number;
  noGoogleAccounts: boolean;
  refunded: number;
  done: boolean;
}

type Outcome = { id: string; status: 'submitted' } | { id: string; status: 'failed' | 'retry'; error: string } | { id: string; status: 'wait'; error: string };

interface PendingRow {
  id: string;
  url: string;
  host: string;
  indexnowKey: string;
  kind: string;
  providerId: string;
  providerConfig: unknown;
  attempts: number;
}

/** UTC day used by the dashboard's quota counters (`quota:gsa:<id>:<day>`). */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Milliseconds until shortly after the next UTC midnight, when Google quotas are counted afresh here. */
export function msUntilQuotaReset(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5);
  return next - now.getTime();
}

async function loadPending(db: Database, batchId: string): Promise<PendingRow[]> {
  return db
    .select({
      id: urlSubmissions.id,
      url: urls.url,
      host: sites.domain,
      indexnowKey: sites.indexnowKey,
      kind: indexingProviders.kind,
      providerId: indexingProviders.id,
      providerConfig: indexingProviders.config,
      attempts: urlSubmissions.attempts,
    })
    .from(urlSubmissions)
    .innerJoin(urls, eq(urls.id, urlSubmissions.urlId))
    .innerJoin(sites, eq(sites.id, urls.siteId))
    .innerJoin(indexingProviders, eq(indexingProviders.id, urlSubmissions.providerId))
    .where(and(eq(urlSubmissions.batchId, batchId), inArray(urlSubmissions.status, [...PENDING])));
}

async function submitIndexNow(deps: ProcessorDeps, rows: PendingRow[]): Promise<Outcome[]> {
  const out: Outcome[] = [];
  // IndexNow requires every URL in a request to share the request's host, so group
  // by each URL's real hostname (a site "example.com" may hold www.example.com URLs).
  const groups = new Map<string, { host: string; rows: PendingRow[] }>();
  for (const r of rows) {
    let host: string;
    try {
      host = new URL(r.url).hostname;
    } catch {
      host = r.host;
    }
    const k = `${r.providerId}|${host}|${r.indexnowKey}`;
    const g = groups.get(k) ?? { host, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  }
  for (const { host, rows: group } of groups.values()) {
    const { indexnowKey, providerConfig } = group[0];
    const endpoint = (providerConfig as { submitEndpoint?: string } | null)?.submitEndpoint || undefined;
    const provider = deps.indexNow(endpoint);
    for (let i = 0; i < group.length; i += INDEXNOW_CHUNK) {
      const part = group.slice(i, i + INDEXNOW_CHUNK);
      const result = await provider.submit({
        domainHostname: host,
        urls: part.map((r) => r.url),
        credentials: { type: 'INDEXNOW_KEY', indexNowKey: indexnowKey, keyLocation: `https://${host}/${indexnowKey}.txt` },
      });
      if (result.success) {
        out.push(...part.map((r) => ({ id: r.id, status: 'submitted' as const })));
      } else {
        const error = `IndexNow: ${result.errorMessage ?? result.errorCode ?? 'rejected'}`;
        const rejected = new Map(result.rejectedUrls.map((x) => [x.url, x.reason]));
        for (const r of part) {
          out.push({ id: r.id, status: result.retryable ? 'retry' : 'failed', error: rejected.get(r.url) ? `IndexNow: ${rejected.get(r.url)}` : error });
        }
      }
    }
  }
  return out;
}

interface Account extends GoogleServiceAccount {
  dailyQuota: number;
}

async function loadAccounts(deps: ProcessorDeps): Promise<Account[]> {
  const rows = await deps.db.select().from(googleServiceAccounts).where(eq(googleServiceAccounts.isActive, true)).orderBy(asc(googleServiceAccounts.createdAt));
  const accounts: Account[] = [];
  for (const r of rows) {
    try {
      accounts.push({ id: r.id, clientEmail: r.clientEmail, privateKey: decryptSecret(r.privateKeyEncrypted, deps.encryptionKey), dailyQuota: r.dailyQuota });
    } catch {
      deps.logger.error({ event: 'gsa.decrypt_failed', accountId: r.id }, 'Could not decrypt service account key (wrong ENCRYPTION_KEY?)');
    }
  }
  return accounts;
}

async function submitGoogle(deps: ProcessorDeps, rows: PendingRow[]): Promise<{ outcomes: Outcome[]; noAccounts: boolean }> {
  const accounts = await loadAccounts(deps);
  if (accounts.length === 0) {
    return { outcomes: rows.map((r) => ({ id: r.id, status: 'wait' as const, error: 'Waiting for a Google service account to be configured' })), noAccounts: true };
  }
  const day = utcDay(deps.now?.() ?? new Date());
  const exhausted = new Set<string>();
  const unusable = new Set<string>();

  /** Reserve one unit of quota on `acct`; false if it's spent for today. */
  async function reserve(acct: Account): Promise<boolean> {
    const key = `quota:gsa:${acct.id}:${day}`;
    const used = await deps.redis.incr(key);
    if (used === 1) await deps.redis.expire(key, 2 * 86_400);
    if (used > acct.dailyQuota) {
      await deps.redis.decr(key);
      exhausted.add(acct.id);
      return false;
    }
    return true;
  }

  async function one(row: PendingRow): Promise<Outcome> {
    const denied: string[] = [];
    let skippedForQuota = false;
    for (const acct of accounts) {
      if (unusable.has(acct.id)) continue;
      if (exhausted.has(acct.id) || !(await reserve(acct))) {
        skippedForQuota = true;
        continue;
      }
      const result = await deps.google.publish(row.url, acct);
      switch (result.kind) {
        case 'ok':
          await deps.redis.incr(`quota:provider:${row.providerId}:${day}`);
          return { id: row.id, status: 'submitted' };
        case 'quota_exhausted':
          skippedForQuota = true;
          exhausted.add(acct.id);
          await deps.redis.set(`quota:gsa:${acct.id}:${day}`, String(acct.dailyQuota), 'EX', 2 * 86_400);
          continue;
        case 'permission_denied':
          // Auth failures (400/401) disable the account; a 403 is per-property, so another account may own it.
          if (result.status === 400 || result.status === 401) unusable.add(acct.id);
          denied.push(result.message);
          continue;
        case 'invalid_url':
          return { id: row.id, status: 'failed', error: `Google rejected the URL: ${result.message}` };
        case 'retryable':
          // A transient error: hand the quota unit back and try this URL again later.
          await deps.redis.decr(`quota:gsa:${acct.id}:${day}`);
          return { id: row.id, status: 'retry', error: `Google: ${result.message}` };
      }
    }
    // Accounts still out of quota today might own the property — wait for them.
    if (skippedForQuota) return { id: row.id, status: 'wait', error: 'Waiting for Google quota to reset' };
    if (accounts.every((a) => unusable.has(a.id))) {
      return { id: row.id, status: 'failed', error: 'Google rejected every service account key — check them under Indexing providers' };
    }
    return { id: row.id, status: 'failed', error: `Google: no service account is an owner of this site in Search Console (${denied[0] ?? 'permission denied'})` };
  }

  const outcomes: Outcome[] = [];
  for (let i = 0; i < rows.length; i += GOOGLE_CONCURRENCY) {
    outcomes.push(...(await Promise.all(rows.slice(i, i + GOOGLE_CONCURRENCY).map(one))));
  }
  return { outcomes, noAccounts: false };
}

/**
 * Push every pending URL of a batch to its engines and record the result.
 * Idempotent: only rows still queued/retrying are touched, and each state
 * change is guarded by that status in the UPDATE itself.
 */
export async function processBatch(deps: ProcessorDeps, batchId: string, opts: { finalAttempt: boolean }): Promise<BatchRunResult> {
  const { db, logger } = deps;
  const now = deps.now?.() ?? new Date();
  const rows = await loadPending(db, batchId);

  const google = rows.filter((r) => r.kind === 'google_indexing');
  const indexNow = rows.filter((r) => r.kind === 'indexnow');
  const unsupported = rows.filter((r) => r.kind !== 'google_indexing' && r.kind !== 'indexnow');

  const outcomes: Outcome[] = unsupported.map((r) => ({ id: r.id, status: 'failed' as const, error: `Provider type "${r.kind}" is not supported by this worker` }));
  outcomes.push(...(await submitIndexNow(deps, indexNow)));
  const g = await submitGoogle(deps, google);
  outcomes.push(...g.outcomes);

  const attemptsById = new Map(rows.map((r) => [r.id, r.attempts]));
  const submittedIds = outcomes.filter((o) => o.status === 'submitted').map((o) => o.id);
  const failures: { id: string; error: string }[] = [];
  const retries: { id: string; error: string }[] = [];
  for (const o of outcomes) {
    if (o.status === 'failed') failures.push(o);
    else if (o.status === 'retry') {
      if (opts.finalAttempt || (attemptsById.get(o.id) ?? 0) + 1 >= MAX_URL_ATTEMPTS) failures.push({ id: o.id, error: `${o.error} (gave up after ${(attemptsById.get(o.id) ?? 0) + 1} tries)` });
      else retries.push(o);
    }
  }
  const waiting = outcomes.filter((o) => o.status === 'wait');

  let refunded = 0;
  await db.transaction(async (tx) => {
    if (submittedIds.length) {
      await tx
        .update(urlSubmissions)
        .set({ status: 'submitted', submittedAt: now, attempts: sql`${urlSubmissions.attempts} + 1`, lastError: null })
        .where(and(inArray(urlSubmissions.id, submittedIds), inArray(urlSubmissions.status, [...PENDING])));
    }
    for (const r of retries) {
      await tx
        .update(urlSubmissions)
        .set({ status: 'retrying', attempts: sql`${urlSubmissions.attempts} + 1`, lastError: r.error.slice(0, 500) })
        .where(and(eq(urlSubmissions.id, r.id), inArray(urlSubmissions.status, [...PENDING])));
    }
    for (const w of waiting) {
      await tx.update(urlSubmissions).set({ lastError: w.error }).where(and(eq(urlSubmissions.id, w.id), inArray(urlSubmissions.status, [...PENDING])));
    }

    // Failed rows refund their credits — RETURNING only rows this call actually moved, so a refund can't happen twice.
    const failedRows: { userId: string; creditCost: number }[] = [];
    for (const f of failures) {
      const moved = await tx
        .update(urlSubmissions)
        .set({ status: 'failed', attempts: sql`${urlSubmissions.attempts} + 1`, lastError: f.error.slice(0, 500) })
        .where(and(eq(urlSubmissions.id, f.id), inArray(urlSubmissions.status, [...PENDING])))
        .returning({ userId: urlSubmissions.userId, creditCost: urlSubmissions.creditCost });
      failedRows.push(...moved);
    }
    const byUser = new Map<string, { credits: number; count: number }>();
    for (const r of failedRows) {
      if (r.creditCost <= 0) continue;
      const cur = byUser.get(r.userId) ?? { credits: 0, count: 0 };
      byUser.set(r.userId, { credits: cur.credits + r.creditCost, count: cur.count + 1 });
    }
    for (const [userId, { credits, count }] of byUser) {
      await tx.update(users).set({ creditBalanceCached: sql`${users.creditBalanceCached} + ${credits}`, updatedAt: now }).where(eq(users.id, userId));
      await tx.insert(creditTransactions).values({ userId, amount: credits, type: 'refund', note: `Refund · ${count} URL${count === 1 ? '' : 's'} could not be submitted`, referenceId: batchId });
      refunded += credits;
    }
  });

  const [{ remaining }] = await db
    .select({ remaining: sql<string>`count(*)` })
    .from(urlSubmissions)
    .where(and(eq(urlSubmissions.batchId, batchId), inArray(urlSubmissions.status, [...PENDING])));
  const done = Number(remaining) === 0;
  if (done) await notifyDone(deps, batchId);

  const result: BatchRunResult = {
    submitted: submittedIds.length,
    failed: failures.length,
    retrying: retries.length,
    waitingForQuota: waiting.length,
    noGoogleAccounts: g.noAccounts && google.length > 0,
    refunded,
    done,
  };
  logger.info({ event: 'batch.processed', batchId, ...result }, 'Batch processed');
  return result;
}

/** One in-app notification per finished batch (guarded so retries never duplicate it). */
async function notifyDone(deps: ProcessorDeps, batchId: string): Promise<void> {
  const batch = await deps.db.query.submissionBatches.findFirst({ where: eq(submissionBatches.id, batchId) });
  if (!batch?.notifyWhenDone) return;
  const first = await deps.redis.set(`batch:notified:${batchId}`, '1', 'EX', 30 * 86_400, 'NX');
  if (first !== 'OK') return;
  const [counts] = await deps.db
    .select({
      submitted: sql<string>`count(DISTINCT ${urlSubmissions.urlId}) FILTER (WHERE ${urlSubmissions.status} IN ('submitted', 'indexed', 'not_indexed'))`,
      failed: sql<string>`count(DISTINCT ${urlSubmissions.urlId}) FILTER (WHERE ${urlSubmissions.status} IN ('failed', 'rejected'))`,
    })
    .from(urlSubmissions)
    .where(eq(urlSubmissions.batchId, batchId));
  const failed = Number(counts?.failed ?? 0);
  await deps.db.insert(notifications).values({
    userId: batch.userId,
    channel: 'in_app',
    type: 'batch.done',
    payload: {
      title: `“${batch.name}” finished submitting`,
      body: `${Number(counts?.submitted ?? 0).toLocaleString('en-US')} URLs submitted${failed ? ` · ${failed.toLocaleString('en-US')} failed and were refunded` : ''}.`,
      link: '/submit',
    },
    sentAt: new Date(),
  });
}
