import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { CreditsService } from './credits.service';

@Controller('organizations/:organizationId/credits')
export class CreditsController {
  constructor(@Inject(CreditsService) private readonly credits: CreditsService) {}

  @Get()
  @UseGuards(AuthGuard, TenantContextGuard)
  findOne(@Param('organizationId') organizationId: string) {
    return this.credits.getBalanceWithRecentLedger(organizationId);
  }
}
