import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CreditSettingsService } from '../credits/credit-settings.service';
import { BillingService } from './billing.service';

/** Unauthenticated data for the marketing site. Only public catalogue fields. */
@Controller('public')
@UseGuards(RateLimitGuard)
export class PublicBillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(CreditSettingsService) private readonly creditSettings: CreditSettingsService,
  ) {}

  @Get('packs')
  @RateLimit({ scope: 'public-packs', limit: 120, windowSeconds: 60 })
  async packs() {
    const packs = await this.billing.listActivePacks();
    return packs.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      priceBdt: Number(p.priceBdt ?? 0),
      priceUsd: Number(p.priceUsd ?? 0),
      isFeatured: p.isFeatured,
    }));
  }

  /** Credits charged per submitted URL, so the pricing page can show a true per-URL price. */
  @Get('pricing')
  @RateLimit({ scope: 'public-packs', limit: 120, windowSeconds: 60 })
  async pricing() {
    const { creditsPerUrl } = await this.creditSettings.get();
    return { creditsPerUrl };
  }
}
