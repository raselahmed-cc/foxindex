import { Inject, Injectable } from '@nestjs/common';
import type { CreateApiKeyInput, UpdateApiKeyInput } from '@foxindex/validation';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ApiKeysRepository } from './api-keys.repository';
import { generateApiKey } from './generate-api-key';

export const MAX_ACTIVE_KEYS_PER_USER = 25;

type KeyRow = Awaited<ReturnType<ApiKeysRepository['listForUser']>>[number];

/** keyHash never crosses the API boundary — only prefix + last 4. */
function toDto(row: KeyRow['key'], siteDomain: string | null, usage7d: number[] = []) {
  return {
    id: row.id,
    name: row.label ?? 'Untitled key',
    keyPrefix: row.keyPrefix,
    keyLast4: row.keyLast4,
    scopes: row.scopes,
    siteId: row.siteId,
    siteDomain,
    monthlyCreditCap: row.monthlyCreditCap,
    ipAllowlist: row.ipAllowlist,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    usage7d,
    requests7d: usage7d.reduce((a, b) => a + b, 0),
  };
}

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(ApiKeysRepository) private readonly repository: ApiKeysRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async list(userId: string) {
    const rows = await this.repository.listForUser(userId);
    const usage = await this.repository.dailyUsage(rows.map((r) => r.key.id));
    const keys = rows.map((r) => toDto(r.key, r.siteDomain, usage.get(r.key.id)));
    const monthlyRequests = await this.repository.monthlyRequests(rows.filter((r) => !r.key.revokedAt).map((r) => r.key.id));
    return { keys, monthlyRequests, rateLimitPerMinute: 600 };
  }

  private async assertSite(userId: string, siteId: string | null | undefined) {
    if (siteId && !(await this.repository.siteBelongsToUser(siteId, userId))) {
      throw new ValidationError('That site is not on your account', { reason: 'SITE_NOT_FOUND' });
    }
  }

  async create(userId: string, input: CreateApiKeyInput) {
    const existing = await this.repository.listForUser(userId);
    if (existing.filter((r) => !r.key.revokedAt).length >= MAX_ACTIVE_KEYS_PER_USER) {
      throw new ValidationError(`You can have at most ${MAX_ACTIVE_KEYS_PER_USER} active keys — revoke one first`, { reason: 'KEY_LIMIT' });
    }
    await this.assertSite(userId, input.siteId);

    const generated = generateApiKey();
    const row = await this.repository.create({
      userId,
      label: input.name,
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      keyLast4: generated.plaintext.slice(-4),
      scopes: input.scopes,
      siteId: input.siteId ?? null,
      monthlyCreditCap: input.monthlyCreditCap ?? null,
      ipAllowlist: input.ipAllowlist,
    });

    await this.auditLog.record({ actorId: userId, action: 'api_key.create', targetType: 'api_key', targetId: row.id, metadata: { name: input.name, scopes: input.scopes } });

    // The only time the plaintext key is ever available — shown once, never persisted or logged.
    return { ...toDto(row, null), plaintext: generated.plaintext };
  }

  async update(userId: string, keyId: string, input: UpdateApiKeyInput) {
    const existing = await this.repository.findForUser(userId, keyId);
    if (!existing || existing.revokedAt) throw new NotFoundError('API key');
    await this.assertSite(userId, input.siteId);

    const row = await this.repository.update(keyId, {
      label: input.name,
      scopes: input.scopes,
      siteId: input.siteId,
      monthlyCreditCap: input.monthlyCreditCap,
      ipAllowlist: input.ipAllowlist,
    });
    await this.auditLog.record({ actorId: userId, action: 'api_key.update', targetType: 'api_key', targetId: keyId, metadata: input });
    return toDto(row, null);
  }

  async revoke(userId: string, keyId: string) {
    const existing = await this.repository.findForUser(userId, keyId);
    if (!existing) throw new NotFoundError('API key');
    if (existing.revokedAt) return toDto(existing, null);

    const row = await this.repository.update(keyId, { revokedAt: new Date() });
    await this.auditLog.record({ actorId: userId, action: 'api_key.revoke', targetType: 'api_key', targetId: keyId, metadata: { name: existing.label } });
    return toDto(row, null);
  }
}
