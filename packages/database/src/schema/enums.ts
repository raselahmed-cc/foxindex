import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ApiKeyScope,
  CreditLedgerReason,
  DomainVerificationMethod,
  DomainVerificationStatus,
  Role,
  SubmissionFailureReason,
  SubmissionProvider,
  UrlSubmissionState,
} from '@foxindex/types';

/**
 * Derives the pgEnum value list from the TS enum in @foxindex/types instead of
 * re-listing the literals here, so the DB enum and the application enum can never
 * drift out of sync.
 */
function pgEnumValues<T extends Record<string, string>>(source: T): [T[keyof T], ...T[keyof T][]] {
  return Object.values(source) as [T[keyof T], ...T[keyof T][]];
}

export const roleEnum = pgEnum('role', pgEnumValues(Role));
export const domainVerificationMethodEnum = pgEnum(
  'domain_verification_method',
  pgEnumValues(DomainVerificationMethod),
);
export const domainVerificationStatusEnum = pgEnum(
  'domain_verification_status',
  pgEnumValues(DomainVerificationStatus),
);
export const urlSubmissionStateEnum = pgEnum('url_submission_state', pgEnumValues(UrlSubmissionState));
export const submissionProviderEnum = pgEnum('submission_provider', pgEnumValues(SubmissionProvider));
export const submissionFailureReasonEnum = pgEnum(
  'submission_failure_reason',
  pgEnumValues(SubmissionFailureReason),
);
export const apiKeyScopeEnum = pgEnum('api_key_scope', pgEnumValues(ApiKeyScope));
export const creditLedgerReasonEnum = pgEnum('credit_ledger_reason', pgEnumValues(CreditLedgerReason));
