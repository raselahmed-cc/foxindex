import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  adjustCreditsSchema,
  creditLedgerQuerySchema,
  creditSettingsSchema,
  type AdjustCreditsInput,
  type CreditLedgerQuery,
  type CreditSettings,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CreditSettingsService } from './credit-settings.service';
import { CreditsAdminService } from './credits-admin.service';

type Actor = AuthenticatedRequest['user'];

/** Credit management for staff. Scoping (manager → own clients) and limits live in CreditsAdminService. */
@Controller('admin/credits')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class CreditsAdminController {
  constructor(
    @Inject(CreditsAdminService) private readonly admin: CreditsAdminService,
    @Inject(CreditSettingsService) private readonly settings: CreditSettingsService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() actor: Actor) {
    return this.admin.overview(actor);
  }

  @Get('limits')
  limits(@CurrentUser() actor: Actor) {
    return this.admin.limitsFor(actor);
  }

  @Get('ledger')
  ledger(@CurrentUser() actor: Actor, @Query(new ZodValidationPipe(creditLedgerQuerySchema)) query: CreditLedgerQuery) {
    return this.admin.ledger(actor, query);
  }

  @Post('users/:userId/adjust')
  adjust(
    @CurrentUser() actor: Actor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(adjustCreditsSchema)) body: AdjustCreditsInput,
  ) {
    return this.admin.adjust(actor, userId, body);
  }

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @Roles(UserRole.SUPERADMIN)
  updateSettings(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(creditSettingsSchema)) body: CreditSettings) {
    return this.settings.update(actor.id, body);
  }
}
