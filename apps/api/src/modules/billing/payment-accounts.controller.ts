import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  addPaymentAccountSchema,
  confirmVaultSchema,
  startVaultSchema,
  updatePaymentAccountSchema,
  type AddPaymentAccountInput,
  type ConfirmVaultInput,
  type StartVaultInput,
  type UpdatePaymentAccountInput,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaymentAccountsService } from './payment-accounts.service';

type Actor = AuthenticatedRequest['user'];

/** A client's own saved payment methods — self-service, no staff involved. */
@Controller('billing')
@UseGuards(AuthGuard, RolesGuard, RateLimitGuard)
@Roles(UserRole.CLIENT)
export class PaymentAccountsController {
  constructor(@Inject(PaymentAccountsService) private readonly accounts: PaymentAccountsService) {}

  @Get('saved-methods')
  list(@CurrentUser() actor: Actor) {
    return this.accounts.list(actor.id);
  }

  @Post('saved-methods')
  @RateLimit({ scope: 'saved-methods', limit: 30, windowSeconds: 3600 })
  add(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(addPaymentAccountSchema)) body: AddPaymentAccountInput) {
    return this.accounts.addManual(actor.id, body);
  }

  @Patch('saved-methods/:id')
  update(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updatePaymentAccountSchema)) body: UpdatePaymentAccountInput) {
    return this.accounts.update(actor.id, id, body);
  }

  @Delete('saved-methods/:id')
  remove(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.remove(actor.id, id);
  }

  @Get('paypal/config')
  paypalConfig() {
    return this.accounts.paypalConfig();
  }

  @Post('paypal/vault')
  @RateLimit({ scope: 'paypal-vault', limit: 15, windowSeconds: 3600 })
  startVault(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(startVaultSchema)) body: StartVaultInput) {
    return this.accounts.startVault(actor.id, body);
  }

  @Post('paypal/vault/confirm')
  @RateLimit({ scope: 'paypal-vault-confirm', limit: 30, windowSeconds: 3600 })
  confirmVault(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(confirmVaultSchema)) body: ConfirmVaultInput) {
    return this.accounts.confirmVault(actor.id, body.setupTokenId);
  }
}
