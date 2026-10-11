import { describe, expect, it, vi } from 'vitest';
import { CreditsService } from './credits.service';
import { NotFoundError } from '../../common/errors/app-error';
import type { CreditsRepository } from './credits.repository';

function makeRepo(balance: number | null, dailyBurn = 0) {
  return {
    getBalance: vi.fn().mockResolvedValue(balance),
    getStats: vi.fn().mockResolvedValue({ usedAllTime: 10, usedThisWeek: 2, dailyBurn, refunded: 1 }),
    recentTransactions: vi.fn().mockResolvedValue([]),
  };
}

describe('CreditsService.getSummary', () => {
  it('estimates days left from the 14-day burn rate', async () => {
    const repo = makeRepo(140, 10);
    const service = new CreditsService(repo as unknown as CreditsRepository);
    await expect(service.getSummary('u1')).resolves.toMatchObject({ balance: 140, daysLeft: 14, usedAllTime: 10 });
  });

  it('reports no estimate when nothing has been spent recently', async () => {
    const service = new CreditsService(makeRepo(140, 0) as unknown as CreditsRepository);
    await expect(service.getSummary('u1')).resolves.toMatchObject({ daysLeft: null });
  });

  it('throws NotFoundError for an unknown user without reading stats', async () => {
    const repo = makeRepo(null);
    const service = new CreditsService(repo as unknown as CreditsRepository);
    await expect(service.getSummary('missing')).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.getStats).not.toHaveBeenCalled();
  });
});
