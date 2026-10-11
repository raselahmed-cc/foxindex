import { Inject, Injectable } from '@nestjs/common';
import type { Database, Transaction } from '@foxindex/database';
import { auditLogs } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';

export interface RecordAuditLogInput {
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Write-path only — nothing reads audit_logs yet (see docs/future-modules.md's audit entry). */
@Injectable()
export class AuditLogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(input: RecordAuditLogInput, tx?: Transaction): Promise<void> {
    const executor = tx ?? this.db;
    await executor.insert(auditLogs).values({
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
      ip: input.ip,
    });
  }
}
