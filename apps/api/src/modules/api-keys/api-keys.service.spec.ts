import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysService } from './api-keys.service';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { ApiKeysRepository } from './api-keys.repository';

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key_1',
    userId: 'user_1',
    label: 'CI key',
    keyHash: 'super-secret-hash-should-never-leak',
    keyPrefix: 'fx_live_abcd',
    keyLast4: 'wxyz',
    scopes: ['submit'],
    siteId: null,
    monthlyCreditCap: null,
    ipAllowlist: [],
    lastUsedAt: null,
    createdAt: new Date(),
    revokedAt: null,
    ...overrides,
  };
}

describe('ApiKeysService', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let service: ApiKeysService;

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(keyRow()),
      listForUser: vi.fn().mockResolvedValue([]),
      findForUser: vi.fn(),
      update: vi.fn(),
      siteBelongsToUser: vi.fn().mockResolvedValue(true),
    };
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    service = new ApiKeysService(repository as unknown as ApiKeysRepository, auditLog as unknown as AuditLogService);
  });

  it('create() returns the plaintext once and never the hash', async () => {
    const result = await service.create('user_1', { name: 'CI key', scopes: ['submit'], ipAllowlist: [] });
    expect(result.plaintext).toMatch(/^fx_live_/);
    expect(JSON.stringify(result)).not.toContain('super-secret-hash');
    const stored = repository.create.mock.calls[0][0];
    expect(stored.keyHash).not.toBe(result.plaintext);
    expect(stored.keyLast4).toBe(result.plaintext.slice(-4));
  });

  it('create() rejects a site the user does not own', async () => {
    repository.siteBelongsToUser.mockResolvedValue(false);
    await expect(
      service.create('user_1', { name: 'x', scopes: ['submit'], siteId: '00000000-0000-0000-0000-000000000000', ipAllowlist: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('revoke() refuses another user’s key', async () => {
    repository.findForUser.mockResolvedValue(undefined);
    await expect(service.revoke('user_2', 'key_1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
