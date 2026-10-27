export interface Project {
  id: string;
  userId: string;
  name: string;
  slug: string;
  indexnowKey: string;
  createdAt: string;
  updatedAt: string;
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

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'signup_bonus' | 'manual_add' | 'manual_deduct' | 'submission_deduct' | 'refund' | 'payment_credit';
  performedBy: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

export interface CreditBalance {
  balance: number;
  recentTransactions: CreditTransaction[];
}

export type UserRole = 'client' | 'manager' | 'admin' | 'superadmin';
export type UserStatus = 'pending_email' | 'pending_approval' | 'active' | 'suspended';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  assignedManagerId: string | null;
  creditBalanceCached: number;
  createdAt: string;
}

export interface Manager {
  id: string;
  name: string;
  email: string;
}
