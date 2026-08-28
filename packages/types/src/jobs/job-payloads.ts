import type { SubmissionProvider } from '../enums';

/** Common fields every FoxIndex job payload must carry (constitution §12). */
interface BaseJobPayload {
  organizationId: string;
  projectId: string;
  attempt: number;
  requestedAt: string;
}

export interface SubmissionJobPayload extends BaseJobPayload {
  jobType: 'URL_SUBMISSION';
  domainId: string;
  urlId: string;
  urlSubmissionId: string;
  provider: SubmissionProvider;
}

export interface VerificationJobPayload extends BaseJobPayload {
  jobType: 'DOMAIN_VERIFICATION';
  domainId: string;
}
