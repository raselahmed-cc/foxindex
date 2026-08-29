import { safeFetch } from '@foxindex/ssrf-fetch';
import { DomainVerificationMethod, DomainVerificationStatus, type VerificationJobPayload } from '@foxindex/types';
import { logEvent, type Logger } from '@foxindex/logger';
import type { VerificationRepository } from './verification-repository';

/** Transient fetch-layer failures — thrown to let BullMQ retry with backoff. Everything else is deterministic and terminal. */
const RETRYABLE_FETCH_ERRORS = new Set(['TIMEOUT', 'NETWORK_ERROR', 'DNS_ERROR']);

export class RetryableVerificationError extends Error {}

/**
 * Checks that a domain's IndexNow key file is actually reachable and matches
 * (constitution §15/§16: verification must be server-side, and any outbound
 * fetch to a user-supplied hostname must be SSRF-safe). A 404 or wrong body
 * content is a deterministic FAILED, not a retry — the user needs to actually
 * upload the file and explicitly request a recheck, not have the worker spin.
 */
export async function processDomainVerification(
  repository: VerificationRepository,
  logger: Logger,
  payload: VerificationJobPayload,
  jobId: string,
): Promise<void> {
  const domain = await repository.findDomainById(payload.domainId);
  if (!domain) {
    logEvent(logger, 'verification.domain_missing', 'Domain no longer exists — skipping', {
      domainId: payload.domainId,
    });
    return;
  }

  const checkedUrl = domain.indexnowKeyLocation ?? `https://${domain.hostname}/${domain.indexnowKey}.txt`;
  const result = await safeFetch(checkedUrl, { method: 'GET', timeoutMs: 5000, maxResponseBytes: 10_000 });

  if (!result.ok) {
    const failureReason = result.error ?? 'UNKNOWN';
    await repository.recordAttempt({
      domainId: domain.id,
      method: DomainVerificationMethod.INDEXNOW_KEY_FILE,
      status: DomainVerificationStatus.FAILED,
      checkedUrl,
      httpStatusCode: null,
      failureReason,
      responseSnippet: result.blockedReason?.slice(0, 500) ?? null,
      jobId,
    });

    if (RETRYABLE_FETCH_ERRORS.has(failureReason)) {
      throw new RetryableVerificationError(`${failureReason}: ${result.blockedReason ?? ''}`);
    }
    await repository.markDomainFailed(domain.id);
    return;
  }

  const bodyMatches = result.body?.trim() === domain.indexnowKey;
  if (!bodyMatches) {
    await repository.recordAttempt({
      domainId: domain.id,
      method: DomainVerificationMethod.INDEXNOW_KEY_FILE,
      status: DomainVerificationStatus.FAILED,
      checkedUrl,
      httpStatusCode: result.statusCode ?? null,
      failureReason: 'KEY_MISMATCH',
      responseSnippet: result.body?.slice(0, 500) ?? null,
      jobId,
    });
    await repository.markDomainFailed(domain.id);
    return;
  }

  await repository.recordAttempt({
    domainId: domain.id,
    method: DomainVerificationMethod.INDEXNOW_KEY_FILE,
    status: DomainVerificationStatus.VERIFIED,
    checkedUrl,
    httpStatusCode: result.statusCode ?? null,
    failureReason: null,
    responseSnippet: result.body?.slice(0, 500) ?? null,
    jobId,
  });
  await repository.markDomainVerified(domain.id, new Date());
  await repository.recordDomainVerifiedAudit(domain.organizationId, domain.id, domain.hostname);
  logEvent(logger, 'domain.verified', `Domain ${domain.hostname} verified`, { domainId: domain.id });
}
