import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, ilike, inArray, lt, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { enqueueBatchJob } from '@foxindex/queue';
import {
  creditTransactions,
  googleServiceAccounts,
  indexingProviders,
  sites,
  submissionBatches,
  urlSubmissions,
  urls,
  users,
  type Database,
  type Transaction,
} from '@foxindex/database';
import { DEFAULT_USER_PREFERENCES, userPreferencesSchema, type BatchListQuery, type CreateBatchInput } from '@foxindex/validation';
import { AppError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { ErrorCode } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';
import { SUBMISSION_QUEUE } from '../../queues/submission-queue.provider';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreditsRepository } from '../credits/credits.repository';
import { CreditSettingsService } from '../credits/credit-settings.service';
import { defaultBatchName, prepareUrls } from './prepare-urls';

const CHUNK = 1000;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type BatchRow = typeof submissionBatches.$inferSelect;

/** Present when a batch is created through the public API. */
export interface BatchApiKeyContext {
  id: string;
  siteId: string | null;
  monthlyCreditCap: number | null;
}

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SUBMISSION_QUEUE) private readonly queue: Queue,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
    @Inject(CreditSettingsService) private readonly creditSettings: CreditSettingsService,
  ) {}

  async create(userId: string, rawInput: CreateBatchInput, apiKey?: BatchApiKeyContext) {
    // A site-restricted key can only ever submit to its own site.
    const input = apiKey?.siteId ? { ...rawInput, siteId: apiKey.siteId, source: 'api' as const } : apiKey ? { ...rawInput, source: 'api' as const } : rawInput;
    let siteDomain: string | undefined;
    if (input.siteId) {
      const site = await this.db.query.sites.findFirst({ where: and(eq(sites.id, input.siteId), eq(sites.userId, userId)) });
      if (!site) throw new NotFoundError('Site');
      siteDomain = site.domain;
    }

    const prepared = prepareUrls(input.urls, siteDomain);
    if (prepared.urls.length === 0) {
      throw new ValidationError('None of those lines is a valid URL to submit', { reason: 'NO_VALID_URLS', skipped: prepared.skipped });
    }

    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { preferences: true } });
    const prefs = { ...DEFAULT_USER_PREFERENCES.submission, ...(userPreferencesSchema.partial().safeParse(user?.preferences ?? {}).data?.submission ?? {}) };

    const providers = await this.db
      .select()
      .from(indexingProviders)
      .where(and(eq(indexingProviders.isActive, true), inArray(indexingProviders.kind, ['google_indexing', 'indexnow'])));
    // Google is only usable once a service account exists; until then URLs still go to the IndexNow engines.
    const [{ n: serviceAccounts }] = await this.db.select({ n: sql<string>`count(*)` }).from(googleServiceAccounts).where(eq(googleServiceAccounts.isActive, true));
    const google = input.engines.google && Number(serviceAccounts) > 0 ? providers.find((p) => p.kind === 'google_indexing') : undefined;
    const others = input.engines.others ? providers.find((p) => p.kind === 'indexnow') : undefined;
    if (!google && !others) {
      throw new AppError(ErrorCode.PROVIDER_ERROR, 'Submission is temporarily unavailable. Please try again later.', { reason: 'NO_ENGINE_AVAILABLE' });
    }

    // One price per accepted URL, whichever engines it goes to (superadmin sets it under Credit management).
    const { creditsPerUrl } = await this.creditSettings.get();
    const perUrl = creditsPerUrl + (input.priority ? 1 : 0);
    const engines = [google ? 'google' : null, others ? 'others' : null].filter((e): e is string => e !== null);
    const name = input.name?.trim() || defaultBatchName(prepared.hosts);

    // Everything below is one transaction: a batch rejected for credits or caps
    // leaves no sites/URLs behind.
    const { batch, balance, targets, alreadyIndexed } = await this.db.transaction(async (tx) => {
      // Serialize concurrent submits per user so two batches can't both pass the balance check.
      await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);

      // Sites are created implicitly per hostname — adding a site first is optional.
      const siteIdByHost = await this.ensureSites(tx, userId, prepared.hosts);
      const urlRows = await this.ensureUrls(tx, userId, prepared.urls.map((u) => ({ ...u, siteId: siteIdByHost.get(u.host)! })));

      const alreadyIndexed = prefs.skipAlreadyIndexed ? urlRows.filter((u) => u.indexedAt) : [];
      const targets = urlRows.filter((u) => !alreadyIndexed.includes(u));
      const skippedCount = prepared.skipped.invalid + prepared.skipped.duplicate + prepared.skipped.otherDomain + alreadyIndexed.length;
      if (targets.length === 0) {
        throw new ValidationError('Every URL in this batch is already indexed', { reason: 'ALL_ALREADY_INDEXED' });
      }
      const cost = targets.length * perUrl;

      if (cost > 0) {
        const [{ total }] = await tx
          .select({ total: sql<string>`coalesce(sum(${creditTransactions.amount}), 0)` })
          .from(creditTransactions)
          .where(eq(creditTransactions.userId, userId));
        const available = Number(total);
        if (available < cost) {
          throw new ValidationError(`This batch needs ${cost.toLocaleString()} credits but you have ${available.toLocaleString()}`, {
            reason: 'INSUFFICIENT_CREDITS',
            needed: cost,
            available,
          });
        }
        if (apiKey?.monthlyCreditCap) {
          const [{ spent }] = await tx
            .select({ spent: sql<string>`coalesce(sum(${submissionBatches.creditsCharged}), 0)` })
            .from(submissionBatches)
            .where(and(eq(submissionBatches.apiKeyId, apiKey.id), sql`${submissionBatches.createdAt} >= date_trunc('month', now())`));
          if (Number(spent) + cost > apiKey.monthlyCreditCap) {
            throw new ValidationError(`This API key's monthly limit of ${apiKey.monthlyCreditCap.toLocaleString()} credits would be exceeded (${Number(spent).toLocaleString()} used)`, {
              reason: 'API_KEY_MONTHLY_CAP',
              cap: apiKey.monthlyCreditCap,
              used: Number(spent),
            });
          }
        }
        if (prefs.dailySpendLimit) {
          const [{ spent }] = await tx
            .select({ spent: sql<string>`coalesce(-sum(${creditTransactions.amount}), 0)` })
            .from(creditTransactions)
            .where(and(eq(creditTransactions.userId, userId), eq(creditTransactions.type, 'submission_deduct'), sql`${creditTransactions.createdAt} >= date_trunc('day', now())`));
          if (Number(spent) + cost > prefs.dailySpendLimit) {
            throw new ValidationError(`This would pass your daily spend limit of ${prefs.dailySpendLimit.toLocaleString()} credits (change it in Settings)`, {
              reason: 'DAILY_LIMIT',
            });
          }
        }
      }

      const [created] = await tx
        .insert(submissionBatches)
        .values({
          userId,
          name,
          source: input.source,
          siteId: input.siteId ?? (prepared.hosts.length === 1 ? siteIdByHost.get(prepared.hosts[0]) : null),
          engines,
          urlCount: targets.length,
          skippedCount,
          creditsCharged: cost,
          priority: input.priority,
          recheckUntilIndexed: input.recheckUntilIndexed,
          notifyWhenDone: input.notifyWhenDone,
          apiKeyId: apiKey?.id ?? null,
        })
        .returning();

      const rows: (typeof urlSubmissions.$inferInsert)[] = [];
      // The URL's charge rides on one submission row — Google when it's used, else IndexNow — so the
      // worker refunds it automatically if that submission fails.
      for (const u of targets) {
        if (google) rows.push({ urlId: u.id, userId, providerId: google.id, batchId: created.id, creditCost: perUrl });
        if (others) rows.push({ urlId: u.id, userId, providerId: others.id, batchId: created.id, creditCost: google ? 0 : perUrl });
      }
      for (const part of chunks(rows)) await tx.insert(urlSubmissions).values(part);

      const newBalance =
        cost > 0
          ? await this.credits.apply(userId, -cost, 'submission_deduct', { note: `${name} · ${targets.length} URLs`, referenceId: created.id, tx })
          : null;

      await this.auditLog.record(
        { actorId: userId, action: 'batch.create', targetType: 'submission_batch', targetId: created.id, metadata: { name, urls: targets.length, credits: cost } },
        tx,
      );
      return { batch: created, balance: newBalance, targets, alreadyIndexed };
    });

    // If Redis is briefly unavailable the rows stay queued; the worker's sweeper re-enqueues them.
    await enqueueBatchJob(this.queue, batch.id, { priority: batch.priority }).catch((error: Error) =>
      this.logger.error(`enqueue failed for batch ${batch.id} (sweeper will retry): ${error.message}`),
    );

    return {
      batch: this.toDto(batch, { queued: targets.length, submitted: 0, indexed: 0, failed: 0 }),
      skipped: { ...prepared.skipped, alreadyIndexed: alreadyIndexed.length },
      balance,
    };
  }

  private async ensureSites(tx: Transaction, userId: string, hosts: string[]): Promise<Map<string, string>> {
    if (hosts.length > 0) {
      await tx
        .insert(sites)
        .values(hosts.map((domain) => ({ userId, domain, indexnowKey: randomBytes(16).toString('hex') })))
        .onConflictDoNothing();
    }
    const rows = await tx.select({ id: sites.id, domain: sites.domain }).from(sites).where(and(eq(sites.userId, userId), inArray(sites.domain, hosts)));
    return new Map(rows.map((r) => [r.domain, r.id]));
  }

  private async ensureUrls(tx: Transaction, userId: string, items: { url: string; normalizedUrl: string; siteId: string }[]) {
    const result: { id: string; normalizedUrl: string; indexedAt: Date | null }[] = [];
    for (const part of chunks(items)) {
      await tx
        .insert(urls)
        .values(part.map((p) => ({ siteId: p.siteId, userId, url: p.url, normalizedUrl: p.normalizedUrl })))
        .onConflictDoNothing();
      const rows = await tx
        .select({ id: urls.id, normalizedUrl: urls.normalizedUrl, indexedAt: urls.indexedAt })
        .from(urls)
        .where(and(eq(urls.userId, userId), inArray(urls.normalizedUrl, part.map((p) => p.normalizedUrl))));
      result.push(...rows);
    }
    return result;
  }

  private async statusCounts(batchIds: string[]) {
    const counts = new Map<string, { queued: number; submitted: number; indexed: number; failed: number }>();
    if (batchIds.length === 0) return counts;
    // Per URL, the best status across engines: indexed > submitted > queued > failed.
    const result = await this.db.execute<{ batch_id: string; queued: string; submitted: string; indexed: string; failed: string }>(sql`
      WITH per_url AS (
        SELECT batch_id, url_id,
          bool_or(status = 'indexed') AS indexed,
          bool_or(status IN ('submitted', 'not_indexed')) AS submitted,
          bool_or(status IN ('queued', 'retrying')) AS queued,
          bool_and(status IN ('failed', 'rejected')) AS failed
        FROM ${urlSubmissions}
        WHERE batch_id IN (${sql.join(batchIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY batch_id, url_id
      )
      SELECT batch_id,
        count(*) FILTER (WHERE indexed) AS indexed,
        count(*) FILTER (WHERE NOT indexed AND submitted) AS submitted,
        count(*) FILTER (WHERE NOT indexed AND NOT submitted AND queued) AS queued,
        count(*) FILTER (WHERE failed) AS failed
      FROM per_url GROUP BY batch_id
    `);
    for (const r of result.rows) {
      counts.set(r.batch_id, { queued: Number(r.queued), submitted: Number(r.submitted), indexed: Number(r.indexed), failed: Number(r.failed) });
    }
    return counts;
  }

  private toDto(b: BatchRow, c: { queued: number; submitted: number; indexed: number; failed: number }) {
    const status = c.queued > 0 ? (c.submitted + c.indexed > 0 ? 'in_progress' : 'queued') : c.failed === b.urlCount ? 'failed' : 'done';
    return {
      id: b.id,
      name: b.name,
      source: b.source,
      engines: b.engines,
      urlCount: b.urlCount,
      skippedCount: b.skippedCount,
      creditsCharged: b.creditsCharged,
      priority: b.priority,
      createdAt: b.createdAt,
      status,
      counts: c,
    };
  }

  async list(userId: string, query: BatchListQuery) {
    const rows = await this.db
      .select()
      .from(submissionBatches)
      .where(
        and(
          eq(submissionBatches.userId, userId),
          query.before ? lt(submissionBatches.createdAt, new Date(query.before)) : undefined,
          query.q ? ilike(submissionBatches.name, `%${query.q.replace(/[%_]/g, '\\$&')}%`) : undefined,
        ),
      )
      .orderBy(desc(submissionBatches.createdAt))
      .limit(query.limit);
    const counts = await this.statusCounts(rows.map((r) => r.id));
    return rows.map((r) => this.toDto(r, counts.get(r.id) ?? { queued: 0, submitted: 0, indexed: 0, failed: 0 }));
  }

  async get(userId: string, batchId: string) {
    const batch = await this.db.query.submissionBatches.findFirst({ where: and(eq(submissionBatches.id, batchId), eq(submissionBatches.userId, userId)) });
    if (!batch) throw new NotFoundError('Batch');
    const counts = await this.statusCounts([batch.id]);
    const items = await this.db.execute<{ url: string; statuses: string; last_error: string | null; indexed_at: string | null }>(sql`
      SELECT u.url, string_agg(DISTINCT s.status::text, ',') AS statuses, max(s.last_error) AS last_error, u.indexed_at
      FROM ${urlSubmissions} s JOIN ${urls} u ON u.id = s.url_id
      WHERE s.batch_id = ${batch.id}
      GROUP BY u.id ORDER BY u.url LIMIT 500
    `);
    return {
      ...this.toDto(batch, counts.get(batch.id) ?? { queued: 0, submitted: 0, indexed: 0, failed: 0 }),
      urls: items.rows.map((r) => ({ url: r.url, statuses: r.statuses.split(','), lastError: r.last_error, indexedAt: r.indexed_at })),
    };
  }

  async rename(userId: string, batchId: string, name: string) {
    const [row] = await this.db
      .update(submissionBatches)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(submissionBatches.id, batchId), eq(submissionBatches.userId, userId)))
      .returning({ id: submissionBatches.id, name: submissionBatches.name });
    if (!row) throw new NotFoundError('Batch');
    return row;
  }
}
