export interface Organization {
  id: string;
  name: string;
  slug: string;
  role?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Domain {
  id: string;
  projectId: string;
  hostname: string;
  indexnowKey: string;
  keyFileUrl: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
  verifiedAt: string | null;
  createdAt: string;
}

export interface DomainVerificationAttempt {
  id: string;
  method: string;
  status: string;
  checkedUrl: string;
  httpStatusCode: number | null;
  failureReason: string | null;
  attemptedAt: string;
}

export interface UrlSubmission {
  id: string;
  urlId: string;
  state: string;
  failureReason: string | null;
  failureDetail: string | null;
  submittedAt: string | null;
  attemptCount: number;
  createdAt: string;
  url?: { normalizedUrl: string };
}

export interface SubmissionAttempt {
  id: string;
  attemptNumber: number;
  provider: string;
  succeeded: boolean;
  responseStatusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptedAt: string;
}

export interface SubmitUrlsResult {
  submissions: { id: string; urlId: string; normalizedUrl: string; hostname: string; state: string }[];
  rejected: { url: string; reason: string; message: string }[];
}

export interface CreditLedgerEntry {
  id: string;
  organizationId: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreditBalance {
  balance: number;
  recentLedger: CreditLedgerEntry[];
}
