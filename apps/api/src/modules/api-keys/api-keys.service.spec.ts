import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyScope } from '@foxindex/types';
import { ApiKeysService } from './api-keys.service';
import { NotFoundError } from '../../common/errors/app-error';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { ApiKeysRepository } from './api-keys.repository';

describe('ApiKeysService', () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findAllForOrganization: ReturnType<typeof vi.fn>;
    findByIdForOrganization: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let auditLog: { record: ReturnType<typeof vi.fn> };
  let service: ApiKeysService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findAllForOrganization: vi.fn(),
      findByIdForOrganization: vi.fn(),
      revoke: vi.fn(),
    };
    auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    service = new ApiKeysService(repository as unknown as ApiKeysRepository, auditLog as unknown as AuditLogService);
  });

  it('create() returns the plaintext key exactly once and never a keyHash', async () => {
    repository.create.mockResolvedValue({
      id: 'key_1',
      organizationId: 'org_1',
      name: 'CI key',
      keyPrefix: 'fx_live_abc',
      keyHash: 'super-secret-hash-should-never-leak',
      scopes: [ApiKeyScope.SUBMIT_URLS],
    });

    const result = await service.create('org_1', { name: 'CI key', scopes: [ApiKeyScope.SUBMIT_URLS] }, 'user_1');

    expect(result.plaintext).toMatch(/^fx_live_/);
    expect(result).not.toHaveProperty('keyHash');
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'api_key.created' }));
  });

  it('create() persists a sha256 hash of the plaintext, not the plaintext itself', async () => {
    repository.create.mockImplementation((input) => Promise.resolve({ id: 'key_1', ...input }));

    await service.create('org_1', { name: 'CI key', scopes: [ApiKeyScope.SUBMIT_URLS] }, 'user_1');

    const [createInput] = repository.create.mock.calls[0];
    expect(createInput.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('findAllForOrganization() strips keyHash from every row', async () => {
    repository.findAllForOrganization.mockResolvedValue([
      { id: 'key_1', keyHash: 'secret-1', name: 'a' },
      { id: 'key_2', keyHash: 'secret-2', name: 'b' },
    ]);

    const result = await service.findAllForOrganization('org_1');

    expect(result.every((row) => !('keyHash' in row))).toBe(true);
  });

  it('revoke() throws NotFoundError for a key that does not belong to the organization', async () => {
    repository.findByIdForOrganization.mockResolvedValue(undefined);
    await expect(service.revoke('org_1', 'key_1', 'user_1')).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.revoke).not.toHaveBeenCalled();
  });

  it('revoke() records an audit log entry', async () => {
    repository.findByIdForOrganization.mockResolvedValue({ id: 'key_1', name: 'a', keyPrefix: 'fx_live_abc' });
    repository.revoke.mockResolvedValue({ id: 'key_1', keyHash: 'secret', revokedAt: new Date() });

    await service.revoke('org_1', 'key_1', 'user_1');

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'api_key.revoked' }));
  });
});
