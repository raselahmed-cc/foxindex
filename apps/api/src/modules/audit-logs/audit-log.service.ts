import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@foxindex/database';
import { auditLogs } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';

export interface RecordAuditLogInput {
  organizationId: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Write-path only (constitution §40) — injected into other modules' services at
 * the point an auditable action happens (organization.created, domain.verified,
 * url.submitted, api_key.created/revoked, ...). No read API/controller yet:
 * nothing consumes one, so building it now would be dead code.
 */
@Injectable()
export class AuditLogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    await this.db.insert(auditLogs).values({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actorApiKeyId: input.actorApiKeyId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
    });
  }
}
