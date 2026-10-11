import { eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { projects, submissionAttempts, urlSubmissions, urls } from '@foxindex/database';
import type { SubmissionFailureReason, SubmissionProvider, UrlSubmissionState } from '@foxindex/types';

export interface SubmissionRow {
  id: string;
  urlId: string;
  state: UrlSubmissionState;
}

export interface UrlRow {
  id: string;
  projectId: string;
  normalizedUrl: string;
}

/** The one IndexNow key a project uses for every URL submitted in it (docs/adr/0013). */
export interface ProjectCredentials {
  indexnowKey: string;
}

export interface SubmissionPatch {
  state?: UrlSubmissionState;
  submittedAt?: Date;
  lastAttemptAt?: Date;
  attemptCount?: number;
  failureReason?: SubmissionFailureReason | null;
  failureDetail?: string | null;
}

export interface RecordAttemptInput {
  urlSubmissionId: string;
  attemptNumber: number;
  provider: SubmissionProvider;
  requestPayload?: unknown;
  responseStatusCode?: number;
  responseBody?: unknown;
  succeeded: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  jobId: string;
}

/** Narrow interface the processor depends on. */
export interface SubmissionRepository {
  findSubmissionById(id: string): Promise<SubmissionRow | undefined>;
  findUrlById(id: string): Promise<UrlRow | undefined>;
  findProjectById(id: string): Promise<ProjectCredentials | undefined>;
  updateSubmission(id: string, patch: SubmissionPatch): Promise<void>;
  recordAttempt(input: RecordAttemptInput): Promise<void>;
}

export function createDrizzleSubmissionRepository(db: Database): SubmissionRepository {
  return {
    async findSubmissionById(id) {
      return db.query.urlSubmissions.findFirst({ where: eq(urlSubmissions.id, id) });
    },
    async findUrlById(id) {
      return db.query.urls.findFirst({ where: eq(urls.id, id) });
    },
    async findProjectById(id) {
      return db.query.projects.findFirst({ where: eq(projects.id, id) });
    },
    async updateSubmission(id, patch) {
      await db
        .update(urlSubmissions)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(urlSubmissions.id, id));
    },
    async recordAttempt(input) {
      await db.insert(submissionAttempts).values({
        urlSubmissionId: input.urlSubmissionId,
        attemptNumber: input.attemptNumber,
        provider: input.provider,
        requestPayload: input.requestPayload,
        responseStatusCode: input.responseStatusCode,
        responseBody: input.responseBody,
        succeeded: input.succeeded,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs,
        jobId: input.jobId,
      });
    },
  };
}
