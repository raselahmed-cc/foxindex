import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../common/errors/app-error';
import { CreditsService } from './credits.service';
import type { CreditsRepository } from './credits.repository';

describe('CreditsService.getBalanceWithRecentLedger', () => {
  it('combines balance and recent ledger for an existing organization', async () => {
    const ledger = [{ id: 'l1', delta: 50, reason: 'SIGNUP_BONUS' }];
    const repo = {
      getBalance: vi.fn().mockResolvedValue(42),
      recentLedger: vi.fn().mockResolvedValue(ledger),
    };
    const service = new CreditsService(repo as unknown as CreditsRepository);

    const result = await service.getBalanceWithRecentLedger('org_1');

    expect(result).toEqual({ balance: 42, recentLedger: ledger });
    expect(repo.getBalance).toHaveBeenCalledWith('org_1');
    expect(repo.recentLedger).toHaveBeenCalledWith('org_1');
  });

  it('throws NotFoundError without querying the ledger when the organization does not exist', async () => {
    const repo = { getBalance: vi.fn().mockResolvedValue(null), recentLedger: vi.fn() };
    const service = new CreditsService(repo as unknown as CreditsRepository);

    await expect(service.getBalanceWithRecentLedger('missing')).rejects.toThrow(NotFoundError);
    expect(repo.recentLedger).not.toHaveBeenCalled();
  });
});
