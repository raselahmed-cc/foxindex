import { Inject, Injectable } from '@nestjs/common';
import type { CreateApiKeyInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ApiKeysRepository } from './api-keys.repository';
import { generateApiKey } from './generate-api-key';

/** keyHash is never returned from any endpoint — no reason to expose it, even though it alone isn't directly usable to authenticate. */
function toSafeDto<T extends { keyHash: string }>(row: T): Omit<T, 'keyHash'> {
  const { keyHash: _keyHash, ...safe } = row;
  return safe;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(ApiKeysRepository) private readonly repository: ApiKeysRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async create(organizationId: string, input: CreateApiKeyInput, userId: string) {
    const generated = generateApiKey();
    const row = await this.repository.create({
      organizationId,
      projectId: input.projectId,
      name: input.name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes: input.scopes,
      createdByUserId: userId,
      expiresAt: input.expiresAt,
    });

    await this.auditLog.record({
      organizationId,
      actorUserId: userId,
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: row.id,
      metadata: { name: row.name, keyPrefix: row.keyPrefix, scopes: row.scopes },
    });

    // The only time the plaintext key is ever available — shown once, never persisted or logged.
    return { ...toSafeDto(row), plaintext: generated.plaintext };
  }

  async findAllForOrganization(organizationId: string) {
    const rows = await this.repository.findAllForOrganization(organizationId);
    return rows.map(toSafeDto);
  }

  async revoke(organizationId: string, keyId: string, userId: string) {
    const existing = await this.repository.findByIdForOrganization(organizationId, keyId);
    if (!existing) throw new NotFoundError('API key');

    const revoked = await this.repository.revoke(keyId);

    await this.auditLog.record({
      organizationId,
      actorUserId: userId,
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: keyId,
      metadata: { name: existing.name, keyPrefix: existing.keyPrefix },
    });

    return toSafeDto(revoked);
  }
}
