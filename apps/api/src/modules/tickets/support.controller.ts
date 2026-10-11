import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  supportSettingsSchema,
  ticketReportQuerySchema,
  upsertMacroSchema,
  type SupportSettings,
  type TicketReportQuery,
  type UpsertMacroInput,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MacrosService } from './macros.service';
import { SupportSettingsService } from './support-settings.service';
import { TicketAutomationService } from './ticket-automation.service';
import { TicketReportsService } from './ticket-reports.service';

type Actor = AuthenticatedRequest['user'];
const STAFF = [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN];
const ADMINS = [UserRole.ADMIN, UserRole.SUPERADMIN];

/** Staff-side support configuration, macros and analytics. */
@Controller('support')
@UseGuards(AuthGuard, RolesGuard)
export class SupportController {
  constructor(
    @Inject(SupportSettingsService) private readonly settings: SupportSettingsService,
    @Inject(MacrosService) private readonly macros: MacrosService,
    @Inject(TicketReportsService) private readonly reports: TicketReportsService,
    @Inject(TicketAutomationService) private readonly automation: TicketAutomationService,
  ) {}

  @Get('settings')
  @Roles(...STAFF)
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @Roles(...ADMINS)
  putSettings(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(supportSettingsSchema)) body: SupportSettings) {
    return this.settings.update(actor.id, body);
  }

  @Post('automation/run')
  @Roles(...ADMINS)
  runAutomation() {
    return this.automation.run();
  }

  @Get('reports')
  @Roles(...STAFF)
  report(@CurrentUser() actor: Actor, @Query(new ZodValidationPipe(ticketReportQuerySchema)) query: TicketReportQuery) {
    return this.reports.report(actor, query);
  }

  @Get('macros')
  @Roles(...STAFF)
  listMacros(@CurrentUser() actor: Actor) {
    return this.macros.list(actor);
  }

  @Post('macros')
  @Roles(...STAFF)
  createMacro(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(upsertMacroSchema)) body: UpsertMacroInput) {
    return this.macros.create(actor, body);
  }

  @Patch('macros/:id')
  @Roles(...STAFF)
  updateMacro(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(upsertMacroSchema)) body: UpsertMacroInput) {
    return this.macros.update(actor, id, body);
  }

  @Delete('macros/:id')
  @Roles(...STAFF)
  deleteMacro(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.macros.remove(actor, id);
  }
}
