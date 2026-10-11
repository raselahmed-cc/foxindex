import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  paymentListQuerySchema,
  rejectPaymentSchema,
  upsertCreditPackSchema,
  upsertPaymentMethodSchema,
  type RejectPaymentInput,
  type UpsertCreditPackInput,
  type UpsertPaymentMethodInput,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillingService } from './billing.service';
import { BillingConfigService } from './billing-config.service';

/** Manager scope is enforced inside BillingService (own clients only, approval limit). */
@Controller('admin/payments')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminPaymentsController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Query(new ZodValidationPipe(paymentListQuerySchema)) query: { status?: 'pending' | 'under_review' | 'approved' | 'rejected' | 'expired' },
  ) {
    return this.billing.listForStaff(actor, query.status);
  }

  @Get('stats')
  stats(@CurrentUser() actor: AuthenticatedRequest['user']) {
    return this.billing.staffStats(actor);
  }

  @Post(':paymentId/approve')
  approve(@CurrentUser() actor: AuthenticatedRequest['user'], @Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.billing.approve(actor, paymentId);
  }

  @Post(':paymentId/reject')
  reject(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body(new ZodValidationPipe(rejectPaymentSchema)) body: RejectPaymentInput,
  ) {
    return this.billing.reject(actor, paymentId, body);
  }
}

@Controller('admin/billing')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminBillingConfigController {
  constructor(@Inject(BillingConfigService) private readonly config: BillingConfigService) {}

  @Get('packs')
  packs() {
    return this.config.listPacks();
  }

  @Post('packs')
  createPack(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(upsertCreditPackSchema)) body: UpsertCreditPackInput,
  ) {
    return this.config.createPack(actor.id, body);
  }

  @Patch('packs/:id')
  updatePack(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(upsertCreditPackSchema.partial())) body: Partial<UpsertCreditPackInput>,
  ) {
    return this.config.updatePack(actor.id, id, body);
  }

  @Get('methods')
  methods() {
    return this.config.listMethods();
  }

  @Post('methods')
  createMethod(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(upsertPaymentMethodSchema)) body: UpsertPaymentMethodInput,
  ) {
    return this.config.createMethod(actor.id, body);
  }

  @Patch('methods/:id')
  updateMethod(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(upsertPaymentMethodSchema.partial())) body: Partial<UpsertPaymentMethodInput>,
  ) {
    return this.config.updateMethod(actor.id, id, body);
  }

  @Get('gateways')
  gateways() {
    return this.config.gateways();
  }
}
