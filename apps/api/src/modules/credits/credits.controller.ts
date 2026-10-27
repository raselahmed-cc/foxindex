import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CreditSettingsService } from './credit-settings.service';
import { CreditsService } from './credits.service';

const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(['signup_bonus', 'manual_add', 'submission_deduct', 'refund', 'payment_credit', 'manual_deduct']).optional(),
  sinceDays: z.coerce.number().int().min(1).max(3650).optional(),
});

@Controller('credits')
@UseGuards(AuthGuard)
export class CreditsController {
  constructor(
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(CreditSettingsService) private readonly settings: CreditSettingsService,
  ) {}

  @Get()
  findOne(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.credits.getBalanceWithRecentTransactions(user.id);
  }

  /** What one URL costs right now — the submit page prices batches from this. */
  @Get('pricing')
  async pricing() {
    const { creditsPerUrl } = await this.settings.get();
    return { creditsPerUrl };
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.credits.getSummary(user.id);
  }

  @Get('ledger')
  ledger(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query(new ZodValidationPipe(ledgerQuerySchema)) query: z.infer<typeof ledgerQuerySchema>,
  ) {
    return this.credits.ledger(user.id, query);
  }
}
