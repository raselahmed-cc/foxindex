import type { SubmissionProvider } from '@foxindex/types';

export type ProviderErrorCode = 'VALIDATION_ERROR' | 'PROVIDER_ERROR' | 'RATE_LIMITED' | 'NETWORK_ERROR';

export interface ProviderCredentials {
  type: 'INDEXNOW_KEY';
  indexNowKey: string;
  keyLocation?: string;
}

export interface SubmissionRequest {
  organizationId: string;
  domainHostname: string;
  urls: string[];
  credentials: ProviderCredentials;
}

/**
 * Unused by IndexNow (it has no quota-reporting API), but part of the contract so a
 * Phase 2 GoogleSearchConsoleProvider (2,000 URL Inspection queries/day/property)
 * can populate it without an interface change.
 */
export interface ProviderQuota {
  limitPerDay?: number;
  remaining?: number;
  resetAt?: Date;
}

export interface SubmissionResult {
  success: boolean;
  providerStatusCode?: number;
  acceptedUrls: string[];
  rejectedUrls: { url: string; reason: string }[];
  providerResponseRaw?: unknown;
  quota?: ProviderQuota;
  errorCode?: ProviderErrorCode;
  errorMessage?: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * A provider never retries internally — one attempt, fail fast. All retry
 * orchestration belongs to the BullMQ job's backoff policy (packages/queue), which
 * is what keeps providers stateless and lets a new provider slot in without
 * duplicating retry logic.
 */
export interface IndexingProvider {
  readonly name: SubmissionProvider;
  submit(request: SubmissionRequest): Promise<SubmissionResult>;
}

export interface IndexStatusResult {
  url: string;
  /** null = inconclusive/unknown, not "confirmed not indexed". */
  indexed: boolean | null;
  lastCrawledAt?: Date;
  raw?: unknown;
}

/** IndexNowProvider does NOT implement this — IndexNow has no status-confirmation API. */
export interface StatusCheckingProvider {
  checkStatus(url: string, credentials: ProviderCredentials): Promise<IndexStatusResult>;
}
