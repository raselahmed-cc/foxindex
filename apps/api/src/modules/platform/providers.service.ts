import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, eq, sql } from 'drizzle-orm';
import type IORedis from 'ioredis';
import { googleServiceAccounts, indexingProviders, urlSubmissions, type Database } from '@foxindex/database';
import type {
  CreateServiceAccountInput,
  ReorderProvidersInput,
  UpdateServiceAccountInput,
  UpsertProviderInput,
} from '@foxindex/validation';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import { encryptSecret } from '../../common/crypto/secret-box';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { AuditLogService } from '../audit-logs/audit-log.service';

interface ProviderConfig {
  description?: string;
  submitEndpoint?: string;
  statusEndpoint?: string;
  apiKeyEncrypted?: string;
  dailyQuota?: number | null;
  costUsd?: number;
  creditCost?: number;
  requestTemplate?: string;
  retriesOnly?: boolean;
  autoPauseAfterErrors?: boolean;
}

/** Daily usage counters are written by the indexing workers: `quota:provider:<id>:<yyyy-mm-dd>` / `quota:gsa:<id>:<yyyy-mm-dd>`. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class ProvidersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  private secret(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  async list() {
    const rows = await this.db.select().from(indexingProviders).orderBy(asc(indexingProviders.priority), asc(indexingProviders.createdAt));
    const stats = await this.db.execute<{ provider_id: string; total: string; ok: string }>(sql`
      SELECT provider_id, count(*) AS total,
             count(*) FILTER (WHERE status IN ('submitted','indexed')) AS ok
      FROM ${urlSubmissions}
      WHERE created_at >= now() - interval '7 days'
      GROUP BY provider_id
    `);
    const statBy = new Map(stats.rows.map((r) => [r.provider_id, r]));
    const used = rows.length ? await this.redis.mget(rows.map((r) => `quota:provider:${r.id}:${today()}`)) : [];

    const totals = await this.serviceAccountTotals();

    return rows.map((p, i) => {
      const cfg = (p.config ?? {}) as ProviderConfig;
      const s = statBy.get(p.id);
      const isGoogle = p.kind === 'google_indexing';
      return {
        id: p.id,
        kind: p.kind,
        label: p.label,
        priority: p.priority,
        isActive: p.isActive,
        description: cfg.description ?? null,
        submitEndpoint: cfg.submitEndpoint ?? null,
        statusEndpoint: cfg.statusEndpoint ?? null,
        hasApiKey: Boolean(cfg.apiKeyEncrypted),
        dailyQuota: isGoogle ? totals.quota : (cfg.dailyQuota ?? null),
        usedToday: isGoogle ? totals.used : Number(used[i] ?? 0),
        costUsd: cfg.costUsd ?? 0,
        creditCost: cfg.creditCost ?? (p.kind === 'indexnow' ? 0 : 1),
        requestTemplate: cfg.requestTemplate ?? null,
        retriesOnly: cfg.retriesOnly ?? false,
        autoPauseAfterErrors: cfg.autoPauseAfterErrors ?? true,
        submissions7d: Number(s?.total ?? 0),
        successRate7d: s && Number(s.total) > 0 ? Number(s.ok) / Number(s.total) : null,
      };
    });
  }

  private buildConfig(input: Partial<UpsertProviderInput>, previous: ProviderConfig = {}): ProviderConfig {
    return {
      ...previous,
      description: input.description ?? previous.description,
      submitEndpoint: input.submitEndpoint ?? previous.submitEndpoint,
      statusEndpoint: input.statusEndpoint ?? previous.statusEndpoint,
      apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey, this.secret()) : previous.apiKeyEncrypted,
      dailyQuota: input.dailyQuota === undefined ? previous.dailyQuota : input.dailyQuota,
      costUsd: input.costUsd ?? previous.costUsd,
      creditCost: input.creditCost ?? previous.creditCost,
      requestTemplate: input.requestTemplate ?? previous.requestTemplate,
      retriesOnly: input.retriesOnly ?? previous.retriesOnly,
      autoPauseAfterErrors: input.autoPauseAfterErrors ?? previous.autoPauseAfterErrors,
    };
  }

  async create(actorId: string, input: UpsertProviderInput) {
    if (input.kind === 'external_api' && !input.submitEndpoint) {
      throw new ValidationError('External providers need a submit endpoint', { reason: 'ENDPOINT_REQUIRED' });
    }
    const [row] = await this.db
      .insert(indexingProviders)
      .values({ kind: input.kind, label: input.label, priority: input.priority, isActive: input.isActive, config: this.buildConfig(input) })
      .returning({ id: indexingProviders.id });
    await this.auditLog.record({ actorId, action: 'provider.create', targetType: 'indexing_provider', targetId: row.id, metadata: { label: input.label, kind: input.kind } });
    return row;
  }

  async update(actorId: string, id: string, input: Partial<UpsertProviderInput>) {
    const existing = await this.db.query.indexingProviders.findFirst({ where: eq(indexingProviders.id, id) });
    if (!existing) throw new NotFoundError('Provider');
    await this.db
      .update(indexingProviders)
      .set({
        label: input.label,
        priority: input.priority,
        isActive: input.isActive,
        config: this.buildConfig(input, (existing.config ?? {}) as ProviderConfig),
      })
      .where(eq(indexingProviders.id, id));
    const { apiKey: _apiKey, ...safe } = input;
    await this.auditLog.record({ actorId, action: 'provider.update', targetType: 'indexing_provider', targetId: id, metadata: { ...safe, apiKeyRotated: Boolean(input.apiKey) } });
    return { id };
  }

  async reorder(actorId: string, input: ReorderProvidersInput) {
    await this.db.transaction(async (tx) => {
      for (const [index, id] of input.ids.entries()) {
        await tx.update(indexingProviders).set({ priority: (index + 1) * 10 }).where(eq(indexingProviders.id, id));
      }
    });
    await this.auditLog.record({ actorId, action: 'provider.reorder', targetType: 'indexing_provider', metadata: { ids: input.ids } });
    return this.list();
  }

  async remove(actorId: string, id: string) {
    const inUse = await this.db.query.urlSubmissions.findFirst({ where: eq(urlSubmissions.providerId, id), columns: { id: true } });
    if (inUse) {
      // Submission history references this row — deactivate instead of breaking the audit trail.
      await this.db.update(indexingProviders).set({ isActive: false }).where(eq(indexingProviders.id, id));
    } else {
      await this.db.delete(indexingProviders).where(eq(indexingProviders.id, id));
    }
    await this.auditLog.record({ actorId, action: 'provider.remove', targetType: 'indexing_provider', targetId: id });
    return { id, deleted: !inUse };
  }

  // ── Google service accounts ────────────────────────────────────────────

  private async serviceAccountTotals() {
    const rows = await this.db.select().from(googleServiceAccounts).where(eq(googleServiceAccounts.isActive, true));
    const used = rows.length ? await this.redis.mget(rows.map((r) => `quota:gsa:${r.id}:${today()}`)) : [];
    return {
      quota: rows.reduce((sum, r) => sum + r.dailyQuota, 0),
      used: used.reduce((sum, v) => sum + Number(v ?? 0), 0),
    };
  }

  async listServiceAccounts() {
    const rows = await this.db.select().from(googleServiceAccounts).orderBy(asc(googleServiceAccounts.createdAt));
    const dayKeys = rows.map((r) => `quota:gsa:${r.id}:${today()}`);
    const errKeys = rows.map((r) => `errors:gsa:${r.id}:${today()}`);
    const lastKeys = rows.map((r) => `lastused:gsa:${r.id}`);
    const [used, errors, last] = rows.length
      ? await Promise.all([this.redis.mget(dayKeys), this.redis.mget(errKeys), this.redis.mget(lastKeys)])
      : [[], [], []];

    return rows.map((r, i) => {
      const usedToday = Number(used[i] ?? 0);
      const errors24h = Number(errors[i] ?? 0);
      const health = !r.isActive ? 'paused' : errors24h >= 5 ? 'errors' : usedToday >= r.dailyQuota * 0.9 ? 'near_quota' : 'healthy';
      return {
        id: r.id,
        label: r.label,
        clientEmail: r.clientEmail,
        gcpProjectId: r.gcpProjectId,
        dailyQuota: r.dailyQuota,
        usedToday,
        errors24h,
        lastUsedAt: last[i] ? new Date(Number(last[i])).toISOString() : null,
        isActive: r.isActive,
        health,
      };
    });
  }

  async addServiceAccount(actorId: string, input: CreateServiceAccountInput) {
    let parsed: { client_email?: string; private_key?: string; project_id?: string; type?: string };
    try {
      parsed = JSON.parse(input.keyJson);
    } catch {
      throw new ValidationError('That is not valid JSON — paste the whole key file', { reason: 'INVALID_KEY_JSON' });
    }
    if (parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key || !parsed.project_id) {
      throw new ValidationError('Key file must be a Google service account key (type, client_email, private_key, project_id)', { reason: 'INVALID_KEY_JSON' });
    }
    const exists = await this.db.query.googleServiceAccounts.findFirst({ where: eq(googleServiceAccounts.clientEmail, parsed.client_email) });
    if (exists) throw new ValidationError('That service account is already added', { reason: 'DUPLICATE' });

    const [row] = await this.db
      .insert(googleServiceAccounts)
      .values({
        label: input.label ?? parsed.client_email.split('@')[0],
        clientEmail: parsed.client_email,
        privateKeyEncrypted: encryptSecret(parsed.private_key, this.secret()),
        gcpProjectId: parsed.project_id,
        dailyQuota: input.dailyQuota,
      })
      .returning({ id: googleServiceAccounts.id });
    await this.auditLog.record({ actorId, action: 'gsa.create', targetType: 'google_service_account', targetId: row.id, metadata: { clientEmail: parsed.client_email } });
    return row;
  }

  async updateServiceAccount(actorId: string, id: string, input: UpdateServiceAccountInput) {
    const [row] = await this.db.update(googleServiceAccounts).set(input).where(eq(googleServiceAccounts.id, id)).returning({ id: googleServiceAccounts.id });
    if (!row) throw new NotFoundError('Service account');
    await this.auditLog.record({ actorId, action: 'gsa.update', targetType: 'google_service_account', targetId: id, metadata: input });
    return row;
  }
}
