import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainVerificationStatus } from '@foxindex/types';
import { DomainsService } from './domains.service';
import { NotFoundError } from '../../common/errors/app-error';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { DomainsRepository } from './domains.repository';

function makeDomain(overrides: Partial<{ verificationStatus: DomainVerificationStatus }> = {}) {
  return {
    id: 'dom_1',
    projectId: 'proj_1',
    organizationId: 'org_1',
    hostname: 'example.com',
    indexnowKey: 'a'.repeat(32),
    verificationStatus: DomainVerificationStatus.PENDING,
    ...overrides,
  };
}

describe('DomainsService.requestVerification', () => {
  let repository: { findByIdForProject: ReturnType<typeof vi.fn> };
  let auditLog: AuditLogService;
  let queue: Queue;
  let service: DomainsService;

  beforeEach(() => {
    repository = { findByIdForProject: vi.fn() };
    auditLog = {} as AuditLogService;
    queue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
    service = new DomainsService(repository as unknown as DomainsRepository, auditLog, queue);
  });

  it('throws NotFoundError when the domain does not belong to the project', async () => {
    repository.findByIdForProject.mockResolvedValue(undefined);
    await expect(service.requestVerification('org_1', 'proj_1', 'dom_1', false)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('enqueues a job for a PENDING domain', async () => {
    repository.findByIdForProject.mockResolvedValue(makeDomain());
    const result = await service.requestVerification('org_1', 'proj_1', 'dom_1', false);
    expect(result).toEqual({ enqueued: true });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('short-circuits without enqueuing for an already-VERIFIED domain when recheck is not requested', async () => {
    repository.findByIdForProject.mockResolvedValue(
      makeDomain({ verificationStatus: DomainVerificationStatus.VERIFIED }),
    );
    const result = await service.requestVerification('org_1', 'proj_1', 'dom_1', false);
    expect(result).toEqual({ enqueued: false });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues again for an already-VERIFIED domain when recheck IS requested', async () => {
    repository.findByIdForProject.mockResolvedValue(
      makeDomain({ verificationStatus: DomainVerificationStatus.VERIFIED }),
    );
    const result = await service.requestVerification('org_1', 'proj_1', 'dom_1', true);
    expect(result).toEqual({ enqueued: true });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('always enqueues for a FAILED domain regardless of recheck', async () => {
    repository.findByIdForProject.mockResolvedValue(
      makeDomain({ verificationStatus: DomainVerificationStatus.FAILED }),
    );
    const result = await service.requestVerification('org_1', 'proj_1', 'dom_1', false);
    expect(result).toEqual({ enqueued: true });
  });
});

describe('DomainsService.findOrCreateByHostname', () => {
  let repository: { findOrCreate: ReturnType<typeof vi.fn> };
  let auditLog: { record: ReturnType<typeof vi.fn> };
  let queue: Queue;
  let service: DomainsService;

  beforeEach(() => {
    repository = { findOrCreate: vi.fn() };
    auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    queue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
    service = new DomainsService(
      repository as unknown as DomainsRepository,
      auditLog as unknown as AuditLogService,
      queue,
    );
  });

  it('records an audit log entry when a new domain is auto-created (docs/adr/0012)', async () => {
    repository.findOrCreate.mockResolvedValue({ domain: makeDomain({}), created: true });

    const result = await service.findOrCreateByHostname('org_1', 'proj_1', 'example.com', 'user_1');

    expect(result.hostname).toBe('example.com');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'domain.created', metadata: expect.objectContaining({ autoCreatedOnSubmit: true }) }),
    );
  });

  it('does not record an audit log entry when the domain already existed', async () => {
    repository.findOrCreate.mockResolvedValue({ domain: makeDomain({}), created: false });

    await service.findOrCreateByHostname('org_1', 'proj_1', 'example.com', 'user_1');

    expect(auditLog.record).not.toHaveBeenCalled();
  });
});
