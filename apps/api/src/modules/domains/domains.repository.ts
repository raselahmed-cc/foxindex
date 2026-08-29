import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { domainVerifications, domains } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';

export interface CreateDomainRow {
  organizationId: string;
  projectId: string;
  hostname: string;
  indexnowKey: string;
  createdByUserId: string;
}

@Injectable()
export class DomainsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: CreateDomainRow) {
    const [domain] = await this.db.insert(domains).values(input).returning();
    return domain;
  }

  findAllForProject(projectId: string) {
    return this.db.query.domains.findMany({ where: eq(domains.projectId, projectId) });
  }

  /**
   * Scoped by BOTH projectId and domainId — never look up a domain by ID alone.
   * Otherwise a caller with legitimate access to project A could substitute a
   * domainId belonging to project B in the URL while keeping their own valid
   * :projectId, and TenantContextGuard (which resolves org from :projectId,
   * not from the domain) would never catch it. This is the actual authorization
   * boundary for every domain-scoped route.
   */
  findByIdForProject(projectId: string, domainId: string) {
    return this.db.query.domains.findFirst({
      where: and(eq(domains.id, domainId), eq(domains.projectId, projectId)),
    });
  }

  findVerificationsForDomain(domainId: string) {
    return this.db.query.domainVerifications.findMany({
      where: eq(domainVerifications.domainId, domainId),
      orderBy: desc(domainVerifications.attemptedAt),
    });
  }
}
