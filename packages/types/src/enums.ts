/**
 * Full role set from the FoxIndex constitution. Phase 1 only actively enforces
 * OWNER/ADMIN/MANAGER-tier vs. member-tier checks via explicit per-route @Roles()
 * allow-lists — the remaining roles exist so org membership records and the schema
 * don't need to change shape when finer-grained authorization is added later.
 */
export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  SEO_MANAGER = 'SEO_MANAGER',
  DEVELOPER = 'DEVELOPER',
  ANALYST = 'ANALYST',
  VIEWER = 'VIEWER',
  BILLING = 'BILLING',
}

export enum DomainVerificationMethod {
  INDEXNOW_KEY_FILE = 'INDEXNOW_KEY_FILE',
}

export enum DomainVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
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
  DOMAIN_NOT_VERIFIED = 'DOMAIN_NOT_VERIFIED',
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
