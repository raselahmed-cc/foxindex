import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '@foxindex/database';
import { urls } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';

export interface UpsertUrlInput {
  organizationId: string;
  projectId: string;
  domainId: string;
  rawUrl: string;
  normalizedUrl: string;
  normalizedUrlHash: string;
  createdByUserId?: string;
}

@Injectable()
export class UrlsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findAllForProject(projectId: string) {
    return this.db.query.urls.findMany({ where: eq(urls.projectId, projectId) });
  }

  findByIdForProject(projectId: string, urlId: string) {
    return this.db.query.urls.findFirst({
      where: and(eq(urls.id, urlId), eq(urls.projectId, projectId)),
    });
  }

  /**
   * The (project_id, normalized_url_hash) dedupe constraint (constitution
   * §10): a re-submission of an already-known URL upserts onto the existing
   * row rather than creating a duplicate.
   */
  async upsert(input: UpsertUrlInput, tx?: Database | Transaction) {
    const executor = tx ?? this.db;
    const [inserted] = await executor
      .insert(urls)
      .values(input)
      .onConflictDoNothing({ target: [urls.projectId, urls.normalizedUrlHash] })
      .returning();
    if (inserted) return inserted;

    const existing = await executor.query.urls.findFirst({
      where: and(eq(urls.projectId, input.projectId), eq(urls.normalizedUrlHash, input.normalizedUrlHash)),
    });
    if (!existing) {
      // Should be unreachable: the insert only no-ops on a conflict with an
      // existing row matching this exact (projectId, hash) pair.
      throw new Error(`URL upsert race: neither inserted nor found for hash ${input.normalizedUrlHash}`);
    }
    return existing;
  }
}
