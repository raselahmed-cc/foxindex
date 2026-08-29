import { eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { auditLogs, domainVerifications, domains } from '@foxindex/database';
import { DomainVerificationStatus, type DomainVerificationMethod } from '@foxindex/types';

export interface DomainRow {
  id: string;
  organizationId: string;
  hostname: string;
  indexnowKey: string;
  indexnowKeyLocation: string | null;
}

export interface RecordAttemptInput {
  domainId: string;
  method: DomainVerificationMethod;
  status: DomainVerificationStatus;
  checkedUrl: string;
  httpStatusCode: number | null;
  failureReason: string | null;
  responseSnippet: string | null;
  jobId: string;
}

/**
 * Narrow interface the processor depends on instead of the full Database type
 * — mirrors packages/queue's IdempotencyCache pattern, so the processor's
 * actual decision logic is unit-testable with a simple in-memory fake instead
 * of a real or mocked Postgres connection.
 */
export interface VerificationRepository {
  findDomainById(domainId: string): Promise<DomainRow | undefined>;
  recordAttempt(input: RecordAttemptInput): Promise<void>;
  /** Does NOT touch verifiedAt — preserves "last successfully verified" history through a later failed recheck. */
  markDomainFailed(domainId: string): Promise<void>;
  markDomainVerified(domainId: string, verifiedAt: Date): Promise<void>;
  /** constitution §40's domain.verified audit action — the worker's own write path, since it has no shared DI with apps/api's AuditLogService. */
  recordDomainVerifiedAudit(organizationId: string, domainId: string, hostname: string): Promise<void>;
}

export function createDrizzleVerificationRepository(db: Database): VerificationRepository {
  return {
    async findDomainById(domainId) {
      return db.query.domains.findFirst({ where: eq(domains.id, domainId) });
    },
    async recordAttempt(input) {
      await db.insert(domainVerifications).values(input);
    },
    async markDomainFailed(domainId) {
      await db
        .update(domains)
        .set({ verificationStatus: DomainVerificationStatus.FAILED, updatedAt: new Date() })
        .where(eq(domains.id, domainId));
    },
    async markDomainVerified(domainId, verifiedAt) {
      await db
        .update(domains)
        .set({
          verificationStatus: DomainVerificationStatus.VERIFIED,
          verifiedAt,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, domainId));
    },
    async recordDomainVerifiedAudit(organizationId, domainId, hostname) {
      await db.insert(auditLogs).values({
        organizationId,
        action: 'domain.verified',
        resourceType: 'domain',
        resourceId: domainId,
        metadata: { hostname },
      });
    },
  };
}
