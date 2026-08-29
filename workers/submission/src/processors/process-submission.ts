import type { ProviderErrorCode, ProviderRouter } from '@foxindex/providers';
import {
  SubmissionFailureReason,
  UrlSubmissionState,
  type SubmissionJobPayload,
} from '@foxindex/types';
import { logEvent, type Logger } from '@foxindex/logger';
import type { SubmissionRepository } from './submission-repository';

export class RetryableSubmissionError extends Error {}

const TERMINAL_STATES = new Set([UrlSubmissionState.SUBMITTED, UrlSubmissionState.FAILED]);

function mapProviderErrorToFailureReason(
  code: ProviderErrorCode | undefined,
): SubmissionFailureReason {
  switch (code) {
    case 'VALIDATION_ERROR':
      return SubmissionFailureReason.INVALID_URL;
    case 'PROVIDER_ERROR':
      return SubmissionFailureReason.PROVIDER_ERROR;
    case 'RATE_LIMITED':
      return SubmissionFailureReason.RATE_LIMITED;
    case 'NETWORK_ERROR':
      return SubmissionFailureReason.NETWORK_ERROR;
    default:
      return SubmissionFailureReason.UNKNOWN;
  }
}

/**
 * Calls the registered provider (IndexNow in Phase 1) for one URL and records
 * the outcome. Idempotent on duplicate delivery: a submission already at a
 * terminal state (SUBMITTED/FAILED) is a no-op, not a re-submission — BullMQ
 * can redeliver a job it already considers failed-and-retried, or an operator
 * could manually re-enqueue, and neither should push a second real request to
 * IndexNow for a URL that's already resolved.
 */
export async function processSubmission(
  repository: SubmissionRepository,
  providerRouter: ProviderRouter,
  logger: Logger,
  payload: SubmissionJobPayload,
  jobId: string,
  attemptNumber: number,
): Promise<void> {
  const submission = await repository.findSubmissionById(payload.urlSubmissionId);
  if (!submission) {
    logEvent(logger, 'submission.missing', 'Submission no longer exists — skipping', {
      urlSubmissionId: payload.urlSubmissionId,
    });
    return;
  }

  if (TERMINAL_STATES.has(submission.state)) {
    logEvent(logger, 'submission.already_terminal', 'Submission already resolved — skipping', {
      urlSubmissionId: submission.id,
      state: submission.state,
    });
    return;
  }

  const url = await repository.findUrlById(payload.urlId);
  const domain = url ? await repository.findDomainById(payload.domainId) : undefined;

  if (!url || !domain) {
    await repository.updateSubmission(submission.id, {
      state: UrlSubmissionState.FAILED,
      failureReason: SubmissionFailureReason.UNKNOWN,
      failureDetail: !url ? 'URL no longer exists' : 'Domain no longer exists',
      lastAttemptAt: new Date(),
      attemptCount: attemptNumber,
    });
    return;
  }

  await repository.updateSubmission(submission.id, {
    state: UrlSubmissionState.PROCESSING,
    lastAttemptAt: new Date(),
    attemptCount: attemptNumber,
  });

  const provider = providerRouter.get(payload.provider);
  const startedAt = Date.now();
  const result = await provider.submit({
    organizationId: payload.organizationId,
    domainHostname: domain.hostname,
    urls: [url.normalizedUrl],
    credentials: {
      type: 'INDEXNOW_KEY',
      indexNowKey: domain.indexnowKey,
      keyLocation: domain.indexnowKeyLocation ?? undefined,
    },
  });
  const durationMs = Date.now() - startedAt;

  await repository.recordAttempt({
    urlSubmissionId: submission.id,
    attemptNumber,
    provider: payload.provider,
    responseStatusCode: result.providerStatusCode,
    responseBody: result.providerResponseRaw,
    succeeded: result.success,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    durationMs,
    jobId,
  });

  if (result.success) {
    await repository.updateSubmission(submission.id, {
      state: UrlSubmissionState.SUBMITTED,
      submittedAt: new Date(),
    });
    logEvent(logger, 'url.submitted', `URL submitted to ${payload.provider}`, {
      urlSubmissionId: submission.id,
      urlId: url.id,
    });
    return;
  }

  if (result.retryable) {
    throw new RetryableSubmissionError(
      `${result.errorCode ?? 'PROVIDER_ERROR'}: ${result.errorMessage ?? 'unknown error'}`,
    );
  }

  await repository.updateSubmission(submission.id, {
    state: UrlSubmissionState.FAILED,
    failureReason: mapProviderErrorToFailureReason(result.errorCode),
    failureDetail: result.errorMessage ?? null,
  });
}
