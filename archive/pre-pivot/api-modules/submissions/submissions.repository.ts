import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Database, Transaction } from '@foxindex/database';
import { urlSubmissions, urls } from '@foxindex/database';
import { SubmissionProvider, UrlSubmissionState } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';

export interface CreateSubmissionInput {
  projectId: string;
  urlId: string;
  userId: string;
  provider: SubmissionProvider;
  requestedByUserId?: string;
  requestedByApiKeyId?: string;
}

export interface ListSubmissionsFilters {
  state?: UrlSubmissionState;
  since?: Date;
  limit: number;
}

@Injectable()
export class SubmissionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Created directly at ACCEPTED, not RECEIVED — by the time this is called,
   * the caller has already normalized and deduped the URL (constitution
   * §37's RECEIVED/VALIDATING states describe the pre-row-existence
   * validation that already happened; the row's existence begins
   * post-validation). A single follow-up update to QUEUED after the job is
   * actually enqueued is enough — no need to persist every transient state
   * as its own write. Optional `tx`: composes into the caller's own
   * transaction alongside the credit deduction it happens with (docs/adr/0011).
   */
  async create(input: CreateSubmissionInput, tx?: Database | Transaction) {
    const [submission] = await (tx ?? this.db)
      .insert(urlSubmissions)
      .values({ ...input, state: UrlSubmissionState.ACCEPTED })
      .returning();
    return submission;
  }

  async markQueued(submissionId: string) {
    const [updated] = await this.db
      .update(urlSubmissions)
      .set({ state: UrlSubmissionState.QUEUED, updatedAt: new Date() })
      .where(eq(urlSubmissions.id, submissionId))
      .returning();
    return updated;
  }

  async findAllForProject(projectId: string, filters: ListSubmissionsFilters) {
    const conditions = [eq(urlSubmissions.projectId, projectId)];
    if (filters.state) conditions.push(eq(urlSubmissions.state, filters.state));

    const rows = await this.db
      .select({ submission: urlSubmissions, url: urls })
      .from(urlSubmissions)
      .innerJoin(urls, eq(urls.id, urlSubmissions.urlId))
      .where(and(...conditions))
      .orderBy(desc(urlSubmissions.createdAt))
      .limit(filters.limit);

    return rows.map((row) => ({ ...row.submission, url: row.url }));
  }

  findByIdForProject(projectId: string, submissionId: string) {
    return this.db.query.urlSubmissions.findFirst({
      where: and(eq(urlSubmissions.id, submissionId), eq(urlSubmissions.projectId, projectId)),
      with: { attempts: true, url: true },
    });
  }
}
