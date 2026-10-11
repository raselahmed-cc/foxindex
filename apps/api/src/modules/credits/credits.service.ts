import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/errors/app-error';
import { CreditsRepository, type CreditTransactionType } from './credits.repository';

@Injectable()
export class CreditsService {
  constructor(@Inject(CreditsRepository) private readonly credits: CreditsRepository) {}

  async getBalanceWithRecentTransactions(userId: string) {
    const balance = await this.credits.getBalance(userId);
    if (balance === null) throw new NotFoundError('User');
    const recentTransactions = await this.credits.recentTransactions(userId);
    return { balance, recentTransactions };
  }

  async getSummary(userId: string) {
    const balance = await this.credits.getBalance(userId);
    if (balance === null) throw new NotFoundError('User');
    const stats = await this.credits.getStats(userId);
    // Only meaningful with real recent usage — a year+ estimate from a handful of URLs is noise.
    const estimate = stats.dailyBurn > 0 ? Math.floor(balance / stats.dailyBurn) : null;
    const daysLeft = estimate !== null && estimate <= 365 ? estimate : null;
    return { balance, ...stats, daysLeft };
  }

  ledger(userId: string, opts: { limit: number; offset: number; type?: CreditTransactionType; sinceDays?: number }) {
    return this.credits.ledger(userId, opts);
  }
}
