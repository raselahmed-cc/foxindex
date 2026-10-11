import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@foxindex/database';
import { SubmissionFailureReason } from '@foxindex/types';
import { SubmissionsService } from './submissions.service';
import type { ProjectRow } from '../../common/guards/project-ownership.guard';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreditsRepository } from '../credits/credits.repository';
import type { UrlsRepository } from '../urls/urls.repository';
import type { SubmissionsRepository } from './submissions.repository';

describe('SubmissionsService.submitUrls', () => {
  const project: ProjectRow = {
    id: 'proj_1',
    userId: 'user_1',
    name: 'Test project',
    slug: 'test-project',
    indexnowKey: 'abc123',
  };

  let urlsRepo: { upsert: ReturnType<typeof vi.fn> };
  let submissionsRepo: { create: ReturnType<typeof vi.fn>; markQueued: ReturnType<typeof vi.fn> };
  let auditLog: { record: ReturnType<typeof vi.fn> };
  let credits: { deduct: ReturnType<typeof vi.fn> };
  let db: { transaction: ReturnType<typeof vi.fn> };
  let queue: Queue;
  let service: SubmissionsService;

  beforeEach(() => {
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
      auditLog as unknown as AuditLogService,
      credits as unknown as CreditsRepository,
      db as unknown as Database,
      queue,
    );
  });

  it('accepts and enqueues a URL under the project owner', async () => {
    const result = await service.submitUrls(project, { urls: ['https://example.com/a'] }, { userId: 'user_1' });

    expect(result.rejected).toEqual([]);
    expect(result.submissions).toEqual([
      expect.objectContaining({ normalizedUrl: 'https://example.com/a', hostname: 'example.com' }),
    ]);
    expect(credits.deduct).toHaveBeenCalledWith('user_1', 1, expect.anything(), expect.anything(), expect.anything());
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(submissionsRepo.markQueued).toHaveBeenCalledTimes(1);
  });

  it('lets a single batch span multiple hostnames — they all submit under the one project key (docs/adr/0013)', async () => {
    const result = await service.submitUrls(
      project,
      { urls: ['https://example.com/a', 'https://another-site.com/b'] },
      { userId: 'user_1' },
    );

    expect(result.rejected).toEqual([]);
    expect(result.submissions).toHaveLength(2);
    expect(result.submissions.map((s) => s.hostname).sort()).toEqual(['another-site.com', 'example.com']);
  });

  it('rejects a URL that cannot be parsed, without creating a row or enqueuing', async () => {
    const result = await service.submitUrls(project, { urls: ['not a url at all'] }, { userId: 'user_1' });

    expect(result.submissions).toEqual([]);
    expect(result.rejected).toEqual([
      { url: 'not a url at all', reason: SubmissionFailureReason.INVALID_URL, message: 'Could not parse this URL' },
    ]);
    expect(urlsRepo.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('handles a mixed batch: accepts parseable URLs and rejects unparseable ones independently', async () => {
    const result = await service.submitUrls(
      project,
      { urls: ['https://example.com/a', 'not a url at all', 'https://example.com/c'] },
      { userId: 'user_1' },
    );

    expect(result.submissions).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].url).toBe('not a url at all');
  });

  it('records a single audit log entry, only when something was accepted', async () => {
    await service.submitUrls(project, { urls: ['not a url at all'] }, { userId: 'user_1' });
    expect(auditLog.record).not.toHaveBeenCalled();

    await service.submitUrls(
      project,
      { urls: ['https://example.com/a', 'https://another-site.com/b'] },
      { userId: 'user_1' },
    );
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'url.submitted',
        userId: 'user_1',
        resourceId: 'proj_1',
        metadata: expect.objectContaining({ acceptedCount: 2, rejectedCount: 0 }),
      }),
    );
  });

  it('rejects a URL when the project owner has insufficient credits, without creating a row or enqueuing (docs/adr/0011)', async () => {
    credits.deduct.mockResolvedValueOnce(null);

    const result = await service.submitUrls(project, { urls: ['https://example.com/a'] }, { userId: 'user_1' });

    expect(result.submissions).toEqual([]);
    expect(result.rejected).toEqual([
      {
        url: 'https://example.com/a',
        reason: SubmissionFailureReason.INSUFFICIENT_CREDITS,
        message: "Project owner's credit balance is insufficient",
      },
    ]);
    expect(urlsRepo.upsert).not.toHaveBeenCalled();
    expect(submissionsRepo.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
