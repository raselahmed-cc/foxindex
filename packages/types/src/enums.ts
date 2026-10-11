/**
 * Global platform role (docs/adr/0014 — supersedes the old USER/ADMIN/
 * SUPER_ADMIN model from docs/adr/0013). Values match the `user_role` pg
 * enum exactly (see packages/database/src/schema/enums.ts) so no mapping
 * layer is needed between the DB row and this type. CLIENT is the default
 * for every self-registered account; MANAGER is assigned a subset of
 * clients; ADMIN/SUPERADMIN are platform operators — see CLAUDE.md "Roles".
 */
export enum UserRole {
  CLIENT = 'client',
  MANAGER = 'manager',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

/** Account lifecycle state (docs/adr/0014) — matches the `user_status` pg enum. */
export enum UserStatus {
  PENDING_EMAIL = 'pending_email',
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/**
 * Centralized URL submission lifecycle (constitution §37). INDEXED/NOT_INDEXED are
 * modeled here because they're part of the product's eventual lifecycle (once a
 * status-checking provider like Google Search Console exists in Phase 2), but no
 * Phase 1 code path ever produces them — IndexNow has no status-confirmation API,
 * so Phase 1 submissions terminate at SUBMITTED or FAILED. See
 * workers/submission/src/processors/process-submission.spec.ts for the test
 * asserting Phase 1 code never reaches MONITORING/INDEXED/NOT_INDEXED, and
 * docs/adr/0001-indexnow-only-instant-submission.md for why the state machine
 * still models them.
 */
export enum UrlSubmissionState {
  RECEIVED = 'RECEIVED',
  VALIDATING = 'VALIDATING',
  ACCEPTED = 'ACCEPTED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  SUBMITTED = 'SUBMITTED',
  MONITORING = 'MONITORING',
  INDEXED = 'INDEXED',
  NOT_INDEXED = 'NOT_INDEXED',
  FAILED = 'FAILED',
}

/** Only INDEXNOW is registered with the ProviderRouter in Phase 1. */
export enum SubmissionProvider {
  INDEXNOW = 'INDEXNOW',
}

export enum SubmissionFailureReason {
  INVALID_URL = 'INVALID_URL',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * credit_ledger.reason (see docs/adr/0011). Non-monetary usage-gating, not the
 * deferred plans/subscriptions/usage_records billing system in future-schema.md.
 */
export enum CreditLedgerReason {
  SIGNUP_BONUS = 'SIGNUP_BONUS',
  MANUAL_GRANT = 'MANUAL_GRANT',
  SUBMISSION_DEDUCTION = 'SUBMISSION_DEDUCTION',
}

export enum ApiKeyScope {
  SUBMIT_URLS = 'SUBMIT_URLS',
  READ_ONLY = 'READ_ONLY',
}

/** constitution §36 error taxonomy. */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  QUEUE_ERROR = 'QUEUE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
