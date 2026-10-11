import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderRouter, SubmissionResult } from '@foxindex/providers';
import { SubmissionFailureReason, SubmissionProvider, UrlSubmissionState } from '@foxindex/types';
import type { Logger } from '@foxindex/logger';
import { processSubmission, RetryableSubmissionError } from './process-submission';
import type { SubmissionRepository } from './submission-repository';

function makeLogger(): Logger {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;
}

function makeRepository(): SubmissionRepository & {
  findSubmissionById: ReturnType<typeof vi.fn>;
  findUrlById: ReturnType<typeof vi.fn>;
  findProjectById: ReturnType<typeof vi.fn>;
  updateSubmission: ReturnType<typeof vi.fn>;
  recordAttempt: ReturnType<typeof vi.fn>;
} {
  return {
    findSubmissionById: vi.fn(),
    findUrlById: vi.fn(),
    findProjectById: vi.fn(),
    updateSubmission: vi.fn().mockResolvedValue(undefined),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
  };
}

function makeProviderRouter(submitResult: SubmissionResult): ProviderRouter {
  const submit = vi.fn().mockResolvedValue(submitResult);
  return {
    get: vi.fn().mockReturnValue({ name: SubmissionProvider.INDEXNOW, submit }),
    register: vi.fn(),
    has: vi.fn(),
  } as unknown as ProviderRouter;
}

const submission = { id: 'sub_1', urlId: 'url_1', state: UrlSubmissionState.QUEUED };
const url = { id: 'url_1', projectId: 'proj_1', normalizedUrl: 'https://example.com/page' };
const project = { indexnowKey: 'a'.repeat(32) };

const payload = {
  projectId: 'proj_1',
  urlId: 'url_1',
  urlSubmissionId: 'sub_1',
  provider: SubmissionProvider.INDEXNOW,
  jobType: 'URL_SUBMISSION' as const,
  attempt: 1,
  requestedAt: new Date().toISOString(),
};

describe('processSubmission', () => {
  let repository: ReturnType<typeof makeRepository>;
  let logger: Logger;

  beforeEach(() => {
    repository = makeRepository();
    logger = makeLogger();
  });

  it('does nothing if the submission no longer exists', async () => {
    repository.findSubmissionById.mockResolvedValue(undefined);
    const router = makeProviderRouter({ success: true, acceptedUrls: [], rejectedUrls: [], retryable: false });

    await processSubmission(repository, router, logger, payload, 'job_1', 1);

    expect(repository.updateSubmission).not.toHaveBeenCalled();
  });

  it.each([UrlSubmissionState.SUBMITTED, UrlSubmissionState.FAILED])(
    'is a no-op when the submission is already terminal (%s) — idempotent on duplicate delivery',
    async (state) => {
      repository.findSubmissionById.mockResolvedValue({ ...submission, state });
      const router = makeProviderRouter({ success: true, acceptedUrls: [], rejectedUrls: [], retryable: false });

      await processSubmission(repository, router, logger, payload, 'job_1', 1);

      expect(router.get).not.toHaveBeenCalled();
      expect(repository.updateSubmission).not.toHaveBeenCalled();
    },
  );

  it('marks SUBMITTED on a successful provider call', async () => {
    repository.findSubmissionById.mockResolvedValue(submission);
    repository.findUrlById.mockResolvedValue(url);
    repository.findProjectById.mockResolvedValue(project);
    const router = makeProviderRouter({
      success: true,
      acceptedUrls: [url.normalizedUrl],
      rejectedUrls: [],
      retryable: false,
      providerStatusCode: 200,
    });

    await processSubmission(repository, router, logger, payload, 'job_1', 1);

    expect(repository.updateSubmission).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ state: UrlSubmissionState.SUBMITTED, submittedAt: expect.any(Date) }),
    );
    expect(repository.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ succeeded: true }));
  });

  it('marks FAILED (not retryable) on a validation error from the provider', async () => {
    repository.findSubmissionById.mockResolvedValue(submission);
    repository.findUrlById.mockResolvedValue(url);
    repository.findProjectById.mockResolvedValue(project);
    const router = makeProviderRouter({
      success: false,
      acceptedUrls: [],
      rejectedUrls: [{ url: url.normalizedUrl, reason: 'bad key' }],
      retryable: false,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: 'IndexNow rejected the request (HTTP 403)',
    });

    await processSubmission(repository, router, logger, payload, 'job_1', 1);

    expect(repository.updateSubmission).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        state: UrlSubmissionState.FAILED,
        failureReason: SubmissionFailureReason.INVALID_URL,
      }),
    );
  });

  it('throws RetryableSubmissionError on a retryable provider error (e.g. rate limited), without marking FAILED', async () => {
    repository.findSubmissionById.mockResolvedValue(submission);
    repository.findUrlById.mockResolvedValue(url);
    repository.findProjectById.mockResolvedValue(project);
    const router = makeProviderRouter({
      success: false,
      acceptedUrls: [],
      rejectedUrls: [],
      retryable: true,
      errorCode: 'RATE_LIMITED',
      errorMessage: 'IndexNow returned 429',
    });

    await expect(processSubmission(repository, router, logger, payload, 'job_1', 1)).rejects.toBeInstanceOf(
      RetryableSubmissionError,
    );

    const failedCalls = repository.updateSubmission.mock.calls.filter(
      ([, patch]) => patch.state === UrlSubmissionState.FAILED,
    );
    expect(failedCalls).toHaveLength(0);
  });

  it('marks FAILED when the URL or project no longer exists, without calling the provider', async () => {
    repository.findSubmissionById.mockResolvedValue(submission);
    repository.findUrlById.mockResolvedValue(undefined);
    const router = makeProviderRouter({ success: true, acceptedUrls: [], rejectedUrls: [], retryable: false });

    await processSubmission(repository, router, logger, payload, 'job_1', 1);

    expect(router.get).not.toHaveBeenCalled();
    expect(repository.updateSubmission).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ state: UrlSubmissionState.FAILED }),
    );
  });

  it("passes the URL's own hostname and the project's IndexNow key as credentials to the provider (docs/adr/0013)", async () => {
    repository.findSubmissionById.mockResolvedValue(submission);
    repository.findUrlById.mockResolvedValue(url);
    repository.findProjectById.mockResolvedValue(project);
    const router = makeProviderRouter({ success: true, acceptedUrls: [], rejectedUrls: [], retryable: false });
    const provider = router.get(SubmissionProvider.INDEXNOW);

    await processSubmission(repository, router, logger, payload, 'job_1', 1);

    expect(provider.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        domainHostname: 'example.com',
        urls: ['https://example.com/page'],
        credentials: { type: 'INDEXNOW_KEY', indexNowKey: project.indexnowKey },
      }),
    );
  });

  it('never sets a submission state that requires a status-checking provider — Phase 1 has none, so MONITORING/INDEXED/NOT_INDEXED must stay unreachable (see docs/adr/0001)', async () => {
    const scenarios: SubmissionResult[] = [
      { success: true, acceptedUrls: [url.normalizedUrl], rejectedUrls: [], retryable: false, providerStatusCode: 200 },
      {
        success: false,
        acceptedUrls: [],
        rejectedUrls: [{ url: url.normalizedUrl, reason: 'bad key' }],
        retryable: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'IndexNow rejected the request (HTTP 403)',
      },
    ];

    const observedStates = new Set<UrlSubmissionState>();

    for (const result of scenarios) {
      const scenarioRepository = makeRepository();
      scenarioRepository.findSubmissionById.mockResolvedValue(submission);
      scenarioRepository.findUrlById.mockResolvedValue(url);
      scenarioRepository.findProjectById.mockResolvedValue(project);
      const router = makeProviderRouter(result);

      await processSubmission(scenarioRepository, router, logger, payload, 'job_1', 1);

      for (const [, patch] of scenarioRepository.updateSubmission.mock.calls) {
        if (patch.state) observedStates.add(patch.state);
      }
    }

    const statusCheckingStates = new Set([
      UrlSubmissionState.MONITORING,
      UrlSubmissionState.INDEXED,
      UrlSubmissionState.NOT_INDEXED,
    ]);
    expect([...observedStates].filter((state) => statusCheckingStates.has(state))).toEqual([]);
    // Sanity check that this test actually exercised state-setting code paths at all,
    // so a future refactor that made processSubmission a no-op wouldn't pass vacuously.
    expect(observedStates.size).toBeGreaterThan(0);
  });
});
