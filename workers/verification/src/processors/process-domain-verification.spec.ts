import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainVerificationStatus } from '@foxindex/types';
import type { SafeFetchResult } from '@foxindex/ssrf-fetch';
import type { Logger } from '@foxindex/logger';
import type { VerificationRepository } from './verification-repository';
import { processDomainVerification, RetryableVerificationError } from './process-domain-verification';

const safeFetch = vi.fn<(...args: unknown[]) => Promise<SafeFetchResult>>();
vi.mock('@foxindex/ssrf-fetch', () => ({ safeFetch: (...args: unknown[]) => safeFetch(...args) }));

function makeLogger(): Logger {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;
}

function makeRepository(): VerificationRepository & {
  findDomainById: ReturnType<typeof vi.fn>;
  recordAttempt: ReturnType<typeof vi.fn>;
  markDomainFailed: ReturnType<typeof vi.fn>;
  markDomainVerified: ReturnType<typeof vi.fn>;
  recordDomainVerifiedAudit: ReturnType<typeof vi.fn>;
} {
  return {
    findDomainById: vi.fn(),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    markDomainFailed: vi.fn().mockResolvedValue(undefined),
    markDomainVerified: vi.fn().mockResolvedValue(undefined),
    recordDomainVerifiedAudit: vi.fn().mockResolvedValue(undefined),
  };
}

const domain = {
  id: 'dom_1',
  organizationId: 'org_1',
  hostname: 'example.com',
  indexnowKey: 'a'.repeat(32),
  indexnowKeyLocation: null,
};

const payload = {
  organizationId: 'org_1',
  projectId: 'proj_1',
  domainId: 'dom_1',
  jobType: 'DOMAIN_VERIFICATION' as const,
  attempt: 1,
  requestedAt: new Date().toISOString(),
};

describe('processDomainVerification', () => {
  let repository: ReturnType<typeof makeRepository>;
  let logger: Logger;

  beforeEach(() => {
    repository = makeRepository();
    logger = makeLogger();
    safeFetch.mockReset();
  });

  it('does nothing if the domain no longer exists (deleted since enqueue)', async () => {
    repository.findDomainById.mockResolvedValue(undefined);
    await processDomainVerification(repository, logger, payload, 'job_1');
    expect(safeFetch).not.toHaveBeenCalled();
    expect(repository.recordAttempt).not.toHaveBeenCalled();
  });

  it('marks VERIFIED when the key file body matches exactly (after trimming)', async () => {
    repository.findDomainById.mockResolvedValue(domain);
    safeFetch.mockResolvedValue({ ok: true, statusCode: 200, body: `${domain.indexnowKey}\n`, finalUrl: '' });

    await processDomainVerification(repository, logger, payload, 'job_1');

    expect(repository.markDomainVerified).toHaveBeenCalledWith('dom_1', expect.any(Date));
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: DomainVerificationStatus.VERIFIED }),
    );
    expect(repository.recordDomainVerifiedAudit).toHaveBeenCalledWith('org_1', 'dom_1', 'example.com');
  });

  it('marks FAILED (not retryable) on a 404 — the file just is not there yet', async () => {
    repository.findDomainById.mockResolvedValue(domain);
    safeFetch.mockResolvedValue({ ok: true, statusCode: 404, body: 'Not Found', finalUrl: '' });

    await processDomainVerification(repository, logger, payload, 'job_1');

    expect(repository.markDomainFailed).toHaveBeenCalledWith('dom_1');
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: DomainVerificationStatus.FAILED, failureReason: 'KEY_MISMATCH' }),
    );
  });

  it('marks FAILED (not retryable) when SSRF-blocked', async () => {
    repository.findDomainById.mockResolvedValue(domain);
    safeFetch.mockResolvedValue({ ok: false, error: 'SSRF_BLOCKED', blockedReason: 'private IP' });

    await processDomainVerification(repository, logger, payload, 'job_1');

    expect(repository.markDomainFailed).toHaveBeenCalledWith('dom_1');
  });

  it('throws RetryableVerificationError on a timeout, and records the attempt before throwing', async () => {
    repository.findDomainById.mockResolvedValue(domain);
    safeFetch.mockResolvedValue({ ok: false, error: 'TIMEOUT', blockedReason: 'Request timed out' });

    await expect(processDomainVerification(repository, logger, payload, 'job_1')).rejects.toBeInstanceOf(
      RetryableVerificationError,
    );
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: DomainVerificationStatus.FAILED, failureReason: 'TIMEOUT' }),
    );
    expect(repository.markDomainFailed).not.toHaveBeenCalled();
  });

  it('throws RetryableVerificationError on a network error', async () => {
    repository.findDomainById.mockResolvedValue(domain);
    safeFetch.mockResolvedValue({ ok: false, error: 'NETWORK_ERROR', blockedReason: 'ECONNRESET' });

    await expect(processDomainVerification(repository, logger, payload, 'job_1')).rejects.toBeInstanceOf(
      RetryableVerificationError,
    );
  });

  it('uses indexnowKeyLocation instead of the default path when set', async () => {
    repository.findDomainById.mockResolvedValue({
      ...domain,
      indexnowKeyLocation: 'https://example.com/custom/path/key.txt',
    });
    safeFetch.mockResolvedValue({ ok: true, statusCode: 200, body: domain.indexnowKey, finalUrl: '' });

    await processDomainVerification(repository, logger, payload, 'job_1');

    expect(safeFetch).toHaveBeenCalledWith('https://example.com/custom/path/key.txt', expect.any(Object));
  });
});
