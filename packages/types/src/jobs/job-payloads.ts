import type { SubmissionProvider } from '../enums';

/**
 * Submission jobs are scoped by project (which owns the one IndexNow key
 * used for every URL in it, docs/adr/0013) — no more organizationId, no
 * domainId (there is no per-domain model anymore).
 */
export interface SubmissionJobPayload {
  jobType: 'URL_SUBMISSION';
  projectId: string;
  urlId: string;
  urlSubmissionId: string;
  provider: SubmissionProvider;
  attempt: number;
  requestedAt: string;
}
