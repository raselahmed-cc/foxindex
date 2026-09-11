import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/errors/app-error';
import { CreditsRepository } from './credits.repository';

@Injectable()
export class CreditsService {
  constructor(@Inject(CreditsRepository) private readonly credits: CreditsRepository) {}

  async getBalanceWithRecentLedger(organizationId: string) {
    const balance = await this.credits.getBalance(organizationId);
    if (balance === null) throw new NotFoundError('Organization');
    const recentLedger = await this.credits.recentLedger(organizationId);
    return { balance, recentLedger };
  }
}
