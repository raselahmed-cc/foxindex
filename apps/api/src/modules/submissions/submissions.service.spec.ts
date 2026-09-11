import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@foxindex/database';
import { DomainVerificationStatus, SubmissionFailureReason } from '@foxindex/types';
import { SubmissionsService } from './submissions.service';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreditsRepository } from '../credits/credits.repository';
import type { DomainsService } from '../domains/domains.service';
import type { UrlsRepository } from '../urls/urls.repository';
import type { SubmissionsRepository } from './submissions.repository';

function makeDomain(overrides: Partial<{ verificationStatus: DomainVerificationStatus }> = {}) {
  return {
    id: 'dom_1',
    hostname: 'example.com',
    verificationStatus: DomainVerificationStatus.VERIFIED,
    ...overrides,
  };
}

describe('SubmissionsService.submitUrls', () => {
  let domains: { findOne: ReturnType<typeof vi.fn> };
  let urlsRepo: { upsert: ReturnType<typeof vi.fn> };
  let submissionsRepo: { create: ReturnType<typeof vi.fn>; markQueued: ReturnType<typeof vi.fn> };
  let auditLog: { record: ReturnType<typeof vi.fn> };
  let credits: { deduct: ReturnType<typeof vi.fn> };
  let db: { transaction: ReturnType<typeof vi.fn> };
  let queue: Queue;
  let service: SubmissionsService;

  beforeEach(() => {
    domains = { findOne: vi.fn().mockResolvedValue(makeDomain()) };
    urlsRepo = {
      upsert: vi.fn().mockImplementation((input) =>
        Promise.resolve({ id: `url_${input.normalizedUrl}`, normalizedUrl: input.normalizedUrl }),
      ),
    };
    submissionsRepo = {
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({ id: `sub_${input.urlId}` }),
      ),
      markQueued: vi.fn().mockResolvedValue(undefined),
    };
    auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    credits = { deduct: vi.fn().mockResolvedValue(49) };
    // The fake tx passed to the callback is never inspected by anything
    // here — every downstream call (urlsRepo.upsert, submissionsRepo.create,
    // credits.deduct) is itself a mock that just records what it was called
    // with, regardless of the tx's actual shape.
    db = { transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) };
    queue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;

    service = new SubmissionsService(
      submissionsRepo as unknown as SubmissionsRepository,
      urlsRepo as unknown as UrlsRepository,
      domains as unknown as DomainsService,
      auditLog as unknown as AuditLogService,
      credits as unknown as CreditsRepository,
      db as unknown as Database,
      queue,
    );
  });

  it('accepts and enqueues a URL that belongs to the verified domain', async () => {
    const result = await service.submitUrls('org_1', 'proj_1', { domainId: 'dom_1', urls: ['https://example.com/a'] }, {
      userId: 'user_1',
    });

    expect(result.rejected).toEqual([]);
    expect(result.submissions).toHaveLength(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(submissionsRepo.markQueued).toHaveBeenCalledTimes(1);
  });

  it('rejects a URL that does not belong to the domain, without creating a row or enqueuing', async () => {
    const result = await service.submitUrls(
      'org_1',
      'proj_1',
      { domainId: 'dom_1', urls: ['https://other.com/a'] },
      { userId: 'user_1' },
    );

    expect(result.submissions).toEqual([]);
    expect(result.rejected).toEqual([
      {
        url: 'https://other.com/a',
        reason: SubmissionFailureReason.INVALID_URL,
        message: 'URL does not belong to domain example.com',
      },
    ]);
    expect(urlsRepo.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('accepts and enqueues a URL even when the domain is not VERIFIED — IndexNow, not FoxIndex, is the real authorization check (docs/adr/0010)', async () => {
    domains.findOne.mockResolvedValue(makeDomain({ verificationStatus: DomainVerificationStatus.PENDING }));

    const result = await service.submitUrls(
      'org_1',
      'proj_1',
      { domainId: 'dom_1', urls: ['https://example.com/a'] },
      { userId: 'user_1' },
    );

    expect(result.rejected).toEqual([]);
    expect(result.submissions).toHaveLength(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('handles a mixed batch: accepts valid URLs and rejects invalid ones independently', async () => {
    const result = await service.submitUrls(
      'org_1',
      'proj_1',
      { domainId: 'dom_1', urls: ['https://example.com/a', 'https://other.com/b', 'https://example.com/c'] },
      { userId: 'user_1' },
    );

    expect(result.submissions).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].url).toBe('https://other.com/b');
  });

  it('records a single audit log entry summarizing the whole batch, only when something was accepted', async () => {
    await service.submitUrls('org_1', 'proj_1', { domainId: 'dom_1', urls: ['https://other.com/a'] }, {
      userId: 'user_1',
    });
    expect(auditLog.record).not.toHaveBeenCalled();

    await service.submitUrls('org_1', 'proj_1', { domainId: 'dom_1', urls: ['https://example.com/a'] }, {
      userId: 'user_1',
    });
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'url.submitted', resourceId: 'proj_1' }),
    );
  });

  it('rejects a URL when the organization has insufficient credits, without creating a row or enqueuing (docs/adr/0011)', async () => {
    credits.deduct.mockResolvedValueOnce(null);

    const result = await service.submitUrls(
      'org_1',
      'proj_1',
      { domainId: 'dom_1', urls: ['https://example.com/a'] },
      { userId: 'user_1' },
    );

    expect(result.submissions).toEqual([]);
    expect(result.rejected).toEqual([
      {
        url: 'https://example.com/a',
        reason: SubmissionFailureReason.INSUFFICIENT_CREDITS,
        message: 'Organization has insufficient credit balance',
      },
    ]);
    expect(urlsRepo.upsert).not.toHaveBeenCalled();
    expect(submissionsRepo.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
