import { and, asc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { indexChecks, indexingProviders, sites, urlSubmissions, urls } from '@foxindex/database';
import type { GoogleIndexingClient, GoogleInspectOutcome } from '@foxindex/providers';
import { loadAccounts, utcDay, type ProcessorDeps } from './batch-processor';
import { connectionFor, ConnectionTokens, loadConnections } from './google-connections';

/**
 * Index status checker. Asks Google (Search Console URL Inspection — the same
 * answer as Search Console's own tool) whether each submitted URL is indexed.
 * Schedule: ~6 h after submission (set by the batch processor), then 24 h, 3 days
 * and 7 days, stopping as soon as Google reports the URL as indexed.
 */

/** Hours until the next check after check #1, #2, #3 (≈ 24 h, 72 h, 7 days after submitting). */
const FOLLOW_UP_HOURS = [18, 48, 96];
/** URL Inspection allows 2,000 calls/day per property; stay safely under it per account. */
const DAILY_INSPECT_QUOTA = 1900;
const BATCH = 40;
const NO_ACCESS_NOTE = 'FoxIndex can’t see this site in Search Console yet. Add the FoxIndex address as an Owner on the Sites page to see Google’s index status.';

export interface IndexCheckDeps extends Pick<ProcessorDeps, 'db' | 'redis' | 'encryptionKey' | 'logger' | 'now' | 'googleOAuth'> {
  google: Pick<GoogleIndexingClient, 'inspect'> & Partial<Pick<GoogleIndexingClient, 'inspectWithToken'>>;
}

export interface IndexCheckRun {
  checked: number;
  indexed: number;
  noAccess: number;
  retryLater: number;
  skipped?: 'no_google_accounts' | 'quota';
}

type IndexStatus = 'indexed' | 'crawled_not_indexed' | 'not_indexed' | 'unknown';

/** Properties to try for a URL: the one that worked before, else domain property then URL-prefix ones. */
export function candidateProperties(url: string, domain: string, known: string | null): string[] {
  if (known) return [known];
  let host = domain;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep the site domain */
  }
  return [...new Set([`sc-domain:${domain.replace(/^www\./, '')}`, `https://${host}/`, `http://${host}/`])];
}

/** Google's verdict → our status. PASS means the page is on Google. */
export function statusFor(verdict: string, coverage: string | null): Exclude<IndexStatus, 'unknown'> {
  if (verdict === 'PASS') return 'indexed';
  if (/crawled.*not indexed/i.test(coverage ?? '')) return 'crawled_not_indexed';
  return 'not_indexed';
}

const hoursFrom = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

export async function runIndexChecks(deps: IndexCheckDeps, limit = BATCH): Promise<IndexCheckRun> {
  const { db, redis } = deps;
  const now = deps.now?.() ?? new Date();
  const run: IndexCheckRun = { checked: 0, indexed: 0, noAccess: 0, retryLater: 0 };

  const due = await db
    .select({ id: urls.id, url: urls.url, userId: urls.userId, siteId: urls.siteId, domain: sites.domain, gscProperty: sites.gscProperty, checkCount: urls.indexCheckCount, indexedAt: urls.indexedAt })
    .from(urls)
    .innerJoin(sites, eq(sites.id, urls.siteId))
    .where(and(isNotNull(urls.nextIndexCheckAt), lte(urls.nextIndexCheckAt, now)))
    .orderBy(asc(urls.nextIndexCheckAt))
    .limit(limit);
  if (due.length === 0) return run;

  // Customers' own "Connect Google" authorizations first, then FoxIndex's service accounts.
  const conns = deps.googleOAuth && deps.google.inspectWithToken ? await loadConnections(db, due.map((u) => u.userId)) : new Map();
  const tokens = new ConnectionTokens(db, deps.googleOAuth ?? null, deps.encryptionKey);
  const accounts = await loadAccounts(deps);
  if (accounts.length === 0 && conns.size === 0) return { ...run, skipped: 'no_google_accounts' };
  const [provider] = await db.select({ id: indexingProviders.id }).from(indexingProviders).where(eq(indexingProviders.kind, 'google_indexing')).limit(1);

  const day = utcDay(now);
  const exhausted = new Set<string>();
  const unusable = new Set<string>();

  for (const u of due) {
    let result: Extract<GoogleInspectOutcome, { kind: 'ok' }> | null = null;
    let usedProperty: string | null = null;
    let denied = false;
    let invalid: string | null = null;
    let retry = false;
    const props = candidateProperties(u.url, u.domain, u.gscProperty);

    const match = connectionFor(conns.get(u.userId), u.url);
    const connToken = match ? await tokens.token(match.conn) : null;
    if (match && connToken && deps.google.inspectWithToken) {
      const r = await deps.google.inspectWithToken(u.url, match.property, connToken, () => tokens.forget(match.conn));
      if (r.kind === 'ok') {
        result = r;
        usedProperty = match.property;
      } else if (r.kind === 'invalid_url') invalid = r.message;
      else if (r.kind === 'retryable') retry = true;
      // permission_denied / quota: fall through to FoxIndex's service accounts.
    }

    accounts: for (const acct of result || invalid || retry ? [] : accounts) {
      if (exhausted.has(acct.id) || unusable.has(acct.id)) continue;
      for (const prop of props) {
        const key = `quota:inspect:${acct.id}:${day}`;
        const used = await redis.incr(key);
        if (used === 1) await redis.expire(key, 2 * 86_400);
        if (used > DAILY_INSPECT_QUOTA) {
          await redis.decr(key);
          exhausted.add(acct.id);
          continue accounts;
        }
        const r = await deps.google.inspect(u.url, prop, acct);
        if (r.kind === 'ok') {
          result = r;
          usedProperty = prop;
          break accounts;
        }
        if (r.kind === 'quota_exhausted') {
          exhausted.add(acct.id);
          continue accounts;
        }
        if (r.kind === 'permission_denied') {
          // A broken key disables the account; a 403 just means this account/property doesn't cover the URL.
          if (/Service account rejected/.test(r.message)) {
            unusable.add(acct.id);
            continue accounts;
          }
          denied = true;
          continue;
        }
        if (r.kind === 'invalid_url') {
          invalid = r.message;
          break accounts;
        }
        await redis.decr(key);
        retry = true;
        break accounts;
      }
    }

    if (!result && !denied && !invalid && !retry) {
      // Every account is out of quota (or unusable) — leave the rest for tomorrow's quota.
      run.skipped = 'quota';
      break;
    }

    const count = u.checkCount + 1;
    await db.transaction(async (tx) => {
      if (result) {
        const status = statusFor(result.verdict, result.coverageState);
        const next = status === 'indexed' ? null : FOLLOW_UP_HOURS[count - 1] !== undefined ? hoursFrom(now, FOLLOW_UP_HOURS[count - 1]) : null;
        await tx
          .update(urls)
          .set({
            indexStatus: status,
            indexCoverage: result.coverageState,
            lastCrawledAt: result.lastCrawlTime ? new Date(result.lastCrawlTime) : null,
            indexCheckedAt: now,
            indexCheckCount: count,
            nextIndexCheckAt: next,
            indexNote: null,
            ...(status === 'indexed' ? { indexedAt: sql`coalesce(${urls.indexedAt}, ${now})` } : {}),
          })
          .where(eq(urls.id, u.id));
        if (usedProperty && usedProperty !== u.gscProperty) await tx.update(sites).set({ gscProperty: usedProperty }).where(eq(sites.id, u.siteId));
        await tx.insert(indexChecks).values({
          urlId: u.id,
          providerId: provider?.id ?? null,
          status,
          requestedAt: now,
          completedAt: now,
          rawResponse: { verdict: result.verdict, coverageState: result.coverageState, lastCrawlTime: result.lastCrawlTime, property: usedProperty },
        });
        if (status === 'indexed') {
          await tx.update(urlSubmissions).set({ status: 'indexed' }).where(and(eq(urlSubmissions.urlId, u.id), inArray(urlSubmissions.status, ['submitted', 'not_indexed'])));
        } else if (next === null) {
          await tx.update(urlSubmissions).set({ status: 'not_indexed' }).where(and(eq(urlSubmissions.urlId, u.id), eq(urlSubmissions.status, 'submitted')));
        }
        run.checked++;
        if (status === 'indexed') run.indexed++;
      } else if (retry) {
        await tx.update(urls).set({ nextIndexCheckAt: hoursFrom(now, 1) }).where(eq(urls.id, u.id));
        run.retryLater++;
      } else {
        // No access to the property, or Google rejected the URL itself.
        await tx
          .update(urls)
          .set({
            indexStatus: 'unknown',
            indexNote: invalid ? `Google couldn’t inspect this URL: ${invalid}` : NO_ACCESS_NOTE,
            indexCheckedAt: now,
            indexCheckCount: count,
            nextIndexCheckAt: !invalid && count < 3 ? hoursFrom(now, 24) : null,
          })
          .where(eq(urls.id, u.id));
        run.noAccess++;
      }
    });
  }
  return run;
}
