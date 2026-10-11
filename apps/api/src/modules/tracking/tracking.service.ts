import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { apiKeys, creditTransactions, googleServiceAccounts, indexingProviders, sites, urlSubmissions, urls, users, type Database } from '@foxindex/database';
import type { CreateSiteInput, PublicSubmitInput, ResubmitUrlsInput, UrlListQuery, UrlStatus } from '@foxindex/validation';
import { ErrorCode } from '@foxindex/types';
import { AppError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import type { Caller } from '../../common/decorators/caller.decorator';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { BatchesService } from '../batches/batches.service';

type EngineKey = 'google' | 'indexnow';
const ENGINE_OF: Record<string, EngineKey> = { google_indexing: 'google', indexnow: 'indexnow' };

export interface EngineState {
  status: string;
  attempts: number;
  error: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

/**
 * Overall URL status from its latest submission per engine:
 * indexed (confirmed) > queued (anything still pending) > submitted (accepted
 * by at least one engine) > failed (every engine gave up).
 */
const STATUS_SQL = sql`CASE
  WHEN u.indexed_at IS NOT NULL THEN 'indexed'
  WHEN bool_or(l.status IN ('queued', 'retrying')) THEN 'queued'
  WHEN bool_or(l.status IN ('submitted', 'indexed', 'not_indexed')) THEN 'submitted'
  ELSE 'failed' END`;

@Injectable()
export class TrackingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(BatchesService) private readonly batches: BatchesService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  /** Site restriction for site-scoped API keys. */
  private siteFilter(caller: Caller, requested?: string): string | undefined {
    if (caller.apiKey?.siteId) {
      if (requested && requested !== caller.apiKey.siteId) throw new NotFoundError('Site');
      return caller.apiKey.siteId;
    }
    return requested;
  }

  /** Latest submission per (url, engine) for this user, then rolled up per URL. */
  private perUrlCte(userId: string, where: SQL) {
    return sql`
      WITH latest AS (
        SELECT DISTINCT ON (s.url_id, p.kind) s.url_id, p.kind, s.status, s.attempts, s.last_error, s.submitted_at, s.created_at
        FROM ${urlSubmissions} s JOIN ${indexingProviders} p ON p.id = s.provider_id
        WHERE s.user_id = ${userId}
        ORDER BY s.url_id, p.kind, s.created_at DESC
      ),
      per_url AS (
        SELECT u.id, u.url, u.site_id, st.domain, u.created_at, u.indexed_at,
          ${STATUS_SQL} AS status,
          coalesce(max(l.created_at), u.created_at) AS last_activity,
          coalesce(jsonb_object_agg(l.kind, jsonb_build_object('status', l.status, 'attempts', l.attempts, 'error', l.last_error, 'submittedAt', l.submitted_at, 'updatedAt', l.created_at)) FILTER (WHERE l.kind IS NOT NULL), '{}'::jsonb) AS engines
        FROM ${urls} u
        JOIN ${sites} st ON st.id = u.site_id
        LEFT JOIN latest l ON l.url_id = u.id
        WHERE u.user_id = ${userId} AND ${where}
        GROUP BY u.id, st.domain
        -- URLs with no submission rows (left by a rejected batch before that was transactional) are not tracked.
        HAVING count(l.url_id) > 0
      )`;
  }

  private toUrlDto(r: { id: string; url: string; site_id: string; domain: string; created_at: string; indexed_at: string | null; status: UrlStatus; last_activity: string; engines: Record<string, EngineState> }) {
    const engines: Partial<Record<EngineKey, EngineState>> = {};
    for (const [kind, state] of Object.entries(r.engines ?? {})) if (ENGINE_OF[kind]) engines[ENGINE_OF[kind]] = state;
    return { id: r.id, url: r.url, site: { id: r.site_id, domain: r.domain }, status: r.status, createdAt: r.created_at, indexedAt: r.indexed_at, lastActivityAt: r.last_activity, engines };
  }

  async listUrls(caller: Caller, query: UrlListQuery) {
    const siteId = this.siteFilter(caller, query.siteId);
    const term = query.q ? `%${query.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const where = sql`${siteId ? sql`u.site_id = ${siteId}` : sql`true`} AND ${term ? sql`u.url ILIKE ${term}` : sql`true`}`;
    const cte = this.perUrlCte(caller.userId, where);

    const [rows, counts] = await Promise.all([
      this.db.execute(sql`${cte}
        SELECT * FROM per_url ${query.status ? sql`WHERE status = ${query.status}` : sql``}
        ORDER BY last_activity DESC, id
        LIMIT ${query.limit + 1} OFFSET ${query.offset}`),
      this.db.execute<{ status: UrlStatus; n: string }>(sql`${cte} SELECT status, count(*) AS n FROM per_url GROUP BY status`),
    ]);
    const items = rows.rows.slice(0, query.limit).map((r) => this.toUrlDto(r as never));
    const byStatus = Object.fromEntries(counts.rows.map((c) => [c.status, Number(c.n)])) as Partial<Record<UrlStatus, number>>;
    return {
      items,
      hasMore: rows.rows.length > query.limit,
      counts: {
        all: Object.values(byStatus).reduce((a, b) => a + (b ?? 0), 0),
        indexed: byStatus.indexed ?? 0,
        submitted: byStatus.submitted ?? 0,
        queued: byStatus.queued ?? 0,
        failed: byStatus.failed ?? 0,
      },
    };
  }

  async getUrl(caller: Caller, id: string) {
    const siteId = this.siteFilter(caller);
    const cte = this.perUrlCte(caller.userId, sql`u.id = ${id} AND ${siteId ? sql`u.site_id = ${siteId}` : sql`true`}`);
    const found = await this.db.execute(sql`${cte} SELECT * FROM per_url`);
    if (!found.rows[0]) throw new NotFoundError('URL');
    const history = await this.db.execute<{ id: string; kind: string; status: string; attempts: number; last_error: string | null; submitted_at: string | null; created_at: string; batch_id: string | null; batch_name: string | null; credit_cost: number }>(sql`
      SELECT s.id, p.kind, s.status, s.attempts, s.last_error, s.submitted_at, s.created_at, s.batch_id, b.name AS batch_name, s.credit_cost
      FROM ${urlSubmissions} s
      JOIN ${indexingProviders} p ON p.id = s.provider_id
      LEFT JOIN submission_batches b ON b.id = s.batch_id
      WHERE s.url_id = ${id} AND s.user_id = ${caller.userId}
      ORDER BY s.created_at DESC LIMIT 100`);
    return {
      ...this.toUrlDto(found.rows[0] as never),
      history: history.rows.map((h) => ({
        id: h.id,
        engine: ENGINE_OF[h.kind] ?? h.kind,
        status: h.status,
        attempts: h.attempts,
        error: h.last_error,
        submittedAt: h.submitted_at,
        createdAt: h.created_at,
        creditCost: h.credit_cost,
        batch: h.batch_id ? { id: h.batch_id, name: h.batch_name } : null,
      })),
    };
  }

  /** Public API / quick submit: a batch from raw URLs. */
  async submit(caller: Caller, input: PublicSubmitInput) {
    let siteId: string | undefined;
    if (input.site) {
      const site = await this.db.query.sites.findFirst({ where: and(eq(sites.userId, caller.userId), eq(sites.domain, input.site.replace(/^www\./, ''))) });
      if (!site) throw new NotFoundError('Site');
      siteId = site.id;
    }
    const google = input.engines.includes('google');
    const others = input.engines.some((e) => e !== 'google');
    return this.batches.create(
      caller.userId,
      { urls: input.urls, name: input.name, siteId, source: caller.apiKey ? 'api' : 'paste', engines: { google, others }, priority: input.priority, recheckUntilIndexed: true, notifyWhenDone: !caller.apiKey },
      caller.apiKey ? { id: caller.apiKey.id, siteId: caller.apiKey.siteId, monthlyCreditCap: caller.apiKey.monthlyCreditCap } : undefined,
    );
  }

  /** Re-send chosen URLs as a new batch (charges credits again, like any submit). */
  async resubmit(caller: Caller, input: ResubmitUrlsInput) {
    const siteId = this.siteFilter(caller);
    const rows = await this.db
      .select({ url: urls.url })
      .from(urls)
      .where(and(eq(urls.userId, caller.userId), inArray(urls.id, input.ids), siteId ? eq(urls.siteId, siteId) : undefined));
    if (rows.length === 0) throw new NotFoundError('URL');
    return this.batches.create(
      caller.userId,
      { urls: rows.map((r) => r.url), name: `Resubmit · ${rows.length} URL${rows.length === 1 ? '' : 's'}`, source: caller.apiKey ? 'api' : 'paste', engines: input.engines, priority: false, recheckUntilIndexed: true, notifyWhenDone: !caller.apiKey },
      caller.apiKey ? { id: caller.apiKey.id, siteId: caller.apiKey.siteId, monthlyCreditCap: caller.apiKey.monthlyCreditCap } : undefined,
    );
  }

  // ── Sites ──────────────────────────────────────────────────────────────

  async listSites(caller: Caller) {
    const siteId = this.siteFilter(caller);
    const result = await this.db.execute<{ id: string; domain: string; created_at: string; total: string; indexed: string; submitted: string; queued: string; failed: string; last_activity: string | null }>(sql`
      ${this.perUrlCte(caller.userId, sql`true`)}
      SELECT st.id, st.domain, st.created_at,
        count(p.id) AS total,
        count(p.id) FILTER (WHERE p.status = 'indexed') AS indexed,
        count(p.id) FILTER (WHERE p.status = 'submitted') AS submitted,
        count(p.id) FILTER (WHERE p.status = 'queued') AS queued,
        count(p.id) FILTER (WHERE p.status = 'failed') AS failed,
        max(p.last_activity) AS last_activity
      FROM ${sites} st LEFT JOIN per_url p ON p.site_id = st.id
      WHERE st.user_id = ${caller.userId} ${siteId ? sql`AND st.id = ${siteId}` : sql``}
      GROUP BY st.id ORDER BY max(p.last_activity) DESC NULLS LAST, st.created_at DESC`);
    return result.rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity,
      counts: { total: Number(r.total), indexed: Number(r.indexed), submitted: Number(r.submitted), queued: Number(r.queued), failed: Number(r.failed) },
    }));
  }

  async createSite(caller: Caller, input: CreateSiteInput) {
    if (caller.apiKey?.siteId) throw new AppError(ErrorCode.AUTHORIZATION_ERROR, 'This API key is limited to one site');
    const [row] = await this.db
      .insert(sites)
      .values({ userId: caller.userId, domain: input.domain, indexnowKey: randomBytes(16).toString('hex') })
      .onConflictDoNothing()
      .returning({ id: sites.id, domain: sites.domain, createdAt: sites.createdAt });
    if (!row) throw new ValidationError(`${input.domain} is already one of your sites`, { reason: 'SITE_EXISTS' });
    await this.auditLog.record({ actorId: caller.userId, action: 'site.create', targetType: 'site', targetId: row.id, metadata: { domain: row.domain } });
    return row;
  }

  async deleteSite(caller: Caller, siteId: string) {
    if (caller.apiKey) throw new AppError(ErrorCode.AUTHORIZATION_ERROR, 'Remove sites from the dashboard');
    const site = await this.db.query.sites.findFirst({ where: and(eq(sites.id, siteId), eq(sites.userId, caller.userId)) });
    if (!site) throw new NotFoundError('Site');
    // "Tracked" = has at least one submission — the same rule the site counts use.
    const [{ n }] = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(urls)
      .where(and(eq(urls.siteId, siteId), sql`EXISTS (SELECT 1 FROM ${urlSubmissions} s WHERE s.url_id = ${urls.id})`));
    if (Number(n) > 0) {
      throw new ValidationError(`${site.domain} has ${Number(n).toLocaleString()} tracked URLs, so it stays for your history`, { reason: 'SITE_HAS_URLS' });
    }
    // api_keys.site_id is ON DELETE SET NULL — deleting the site would silently widen a
    // site-restricted key to the whole account, so those keys must be dealt with first.
    const scopedKeys = await this.db.select({ name: apiKeys.label }).from(apiKeys).where(and(eq(apiKeys.siteId, siteId), isNull(apiKeys.revokedAt)));
    if (scopedKeys.length > 0) {
      throw new ValidationError(`Revoke or change the API key${scopedKeys.length === 1 ? '' : 's'} limited to ${site.domain} first (${scopedKeys.map((k) => k.name ?? 'unnamed').join(', ')})`, { reason: 'SITE_HAS_API_KEYS' });
    }
    await this.db.transaction(async (tx) => {
      // Never-submitted URL rows (nothing references them) go with the site.
      await tx.execute(sql`DELETE FROM ${urls} u WHERE u.site_id = ${siteId}
        AND NOT EXISTS (SELECT 1 FROM ${urlSubmissions} s WHERE s.url_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM index_checks c WHERE c.url_id = u.id)`);
      await tx.delete(sites).where(eq(sites.id, siteId));
    });
    await this.auditLog.record({ actorId: caller.userId, action: 'site.delete', targetType: 'site', targetId: siteId, metadata: { domain: site.domain } });
    return { ok: true };
  }

  /**
   * Google only accepts Indexing API notifications from an Owner of the
   * Search Console property, so clients add these addresses as owners.
   */
  async googleSetup() {
    const [accounts, provider] = await Promise.all([
      this.db.select({ email: googleServiceAccounts.clientEmail }).from(googleServiceAccounts).where(eq(googleServiceAccounts.isActive, true)).orderBy(asc(googleServiceAccounts.createdAt)),
      this.db.query.indexingProviders.findFirst({ where: and(eq(indexingProviders.kind, 'google_indexing'), eq(indexingProviders.isActive, true)) }),
    ]);
    return { enabled: Boolean(provider) && accounts.length > 0, serviceAccountEmails: accounts.map((a) => a.email) };
  }

  // ── Overview ───────────────────────────────────────────────────────────

  async overview(userId: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { creditBalanceCached: true, timezone: true } });
    const tz = user?.timezone || 'Asia/Dhaka';
    const caller: Caller = { userId, apiKey: null };
    const [urlsPage, sitesList, series, engineStats, refunds, recentBatches] = await Promise.all([
      this.listUrls(caller, { limit: 6, offset: 0 }),
      this.listSites(caller),
      this.db.execute<{ day: string; submitted: string; accepted: string }>(sql`
        WITH d AS (SELECT generate_series(date_trunc('day', (now() AT TIME ZONE ${tz}) - interval '13 days'), date_trunc('day', now() AT TIME ZONE ${tz}), interval '1 day')::date AS day)
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
          (SELECT count(DISTINCT s.url_id) FROM ${urlSubmissions} s WHERE s.user_id = ${userId} AND (s.created_at AT TIME ZONE ${tz})::date = d.day) AS submitted,
          (SELECT count(DISTINCT s.url_id) FROM ${urlSubmissions} s WHERE s.user_id = ${userId} AND (s.submitted_at AT TIME ZONE ${tz})::date = d.day) AS accepted
        FROM d ORDER BY d.day`),
      this.db.execute<{ kind: string; total: string; ok: string; failed: string; pending: string }>(sql`
        SELECT p.kind, count(*) AS total,
          count(*) FILTER (WHERE s.status IN ('submitted', 'indexed', 'not_indexed')) AS ok,
          count(*) FILTER (WHERE s.status IN ('failed', 'rejected')) AS failed,
          count(*) FILTER (WHERE s.status IN ('queued', 'retrying')) AS pending
        FROM ${urlSubmissions} s JOIN ${indexingProviders} p ON p.id = s.provider_id
        WHERE s.user_id = ${userId} AND s.created_at >= now() - interval '30 days'
        GROUP BY p.kind`),
      this.db
        .select({ total: sql<string>`coalesce(sum(${creditTransactions.amount}), 0)`, n: sql<string>`count(*)` })
        .from(creditTransactions)
        .where(and(eq(creditTransactions.userId, userId), eq(creditTransactions.type, 'refund'), sql`${creditTransactions.createdAt} >= now() - interval '30 days'`)),
      this.batches.list(userId, { limit: 5 }),
    ]);
    return {
      balance: user?.creditBalanceCached ?? 0,
      counts: urlsPage.counts,
      refundedCredits30d: Number(refunds[0]?.total ?? 0),
      series: series.rows.map((r) => ({ day: r.day, submitted: Number(r.submitted), accepted: Number(r.accepted) })),
      engines: engineStats.rows.map((r) => ({ engine: ENGINE_OF[r.kind] ?? r.kind, total: Number(r.total), ok: Number(r.ok), failed: Number(r.failed), pending: Number(r.pending) })),
      sites: sitesList.slice(0, 3),
      recentUrls: urlsPage.items,
      recentBatches,
    };
  }
}
