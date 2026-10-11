import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  auditLogQuerySchema,
  createServiceAccountSchema,
  inviteStaffSchema,
  reorderProvidersSchema,
  updateServiceAccountSchema,
  updateStaffSchema,
  upsertProviderSchema,
  type AuditLogQuery,
  type CreateServiceAccountInput,
  type InviteStaffInput,
  type ReorderProvidersInput,
  type UpdateServiceAccountInput,
  type UpdateStaffInput,
  type UpsertProviderInput,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OverviewService } from './overview.service';
import { ProvidersService } from './providers.service';
import { StaffService } from './staff.service';

type Actor = AuthenticatedRequest['user'];

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class PlatformController {
  constructor(
    @Inject(OverviewService) private readonly overview: OverviewService,
    @Inject(ProvidersService) private readonly providers: ProvidersService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  @Get('overview')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getOverview(@CurrentUser() actor: Actor) {
    return this.overview.overview(actor.role);
  }

  @Get('audit-logs')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  auditLogs(@CurrentUser() actor: Actor, @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery) {
    return this.overview.auditLog(query, actor.role);
  }

  // ── Providers (superadmin) ─────────────────────────────────────────────

  @Get('providers')
  @Roles(UserRole.SUPERADMIN)
  listProviders() {
    return this.providers.list();
  }

  @Post('providers')
  @Roles(UserRole.SUPERADMIN)
  createProvider(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(upsertProviderSchema)) body: UpsertProviderInput) {
    return this.providers.create(actor.id, body);
  }

  @Put('providers/order')
  @Roles(UserRole.SUPERADMIN)
  reorderProviders(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(reorderProvidersSchema)) body: ReorderProvidersInput) {
    return this.providers.reorder(actor.id, body);
  }

  @Patch('providers/:id')
  @Roles(UserRole.SUPERADMIN)
  updateProvider(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(upsertProviderSchema.partial())) body: Partial<UpsertProviderInput>,
  ) {
    return this.providers.update(actor.id, id, body);
  }

  @Delete('providers/:id')
  @Roles(UserRole.SUPERADMIN)
  removeProvider(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.providers.remove(actor.id, id);
  }

  @Get('service-accounts')
  @Roles(UserRole.SUPERADMIN)
  listServiceAccounts() {
    return this.providers.listServiceAccounts();
  }

  @Post('service-accounts')
  @Roles(UserRole.SUPERADMIN)
  addServiceAccount(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(createServiceAccountSchema)) body: CreateServiceAccountInput) {
    return this.providers.addServiceAccount(actor.id, body);
  }

  @Patch('service-accounts/:id')
  @Roles(UserRole.SUPERADMIN)
  updateServiceAccount(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateServiceAccountSchema)) body: UpdateServiceAccountInput,
  ) {
    return this.providers.updateServiceAccount(actor.id, id, body);
  }

  // ── Staff (superadmin: everyone · admin: managers only, enforced in StaffService) ──

  @Get('staff')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  listStaff(@CurrentUser() actor: Actor) {
    return this.staff.list(actor);
  }

  @Post('staff')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  invite(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(inviteStaffSchema)) body: InviteStaffInput) {
    return this.staff.invite(actor, body);
  }

  @Patch('staff/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  updateStaff(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
  ) {
    return this.staff.update(actor, id, body);
  }
}
