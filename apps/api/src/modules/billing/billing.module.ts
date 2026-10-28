import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { mailerProvider } from '../auth/mailer.provider';
import { AamarPayClient } from './aamarpay.client';
import { BillingService } from './billing.service';
import { GatewayReconcilerService } from './gateway-reconciler.service';
import { BillingConfigService } from './billing-config.service';
import { AamarPayReturnController, BillingController, PayPalReturnController } from './billing.controller';
import { PaymentAccountsController } from './payment-accounts.controller';
import { PaymentAccountsService } from './payment-accounts.service';
import { PayPalClient } from './paypal.client';
import { AdminBillingConfigController, AdminPaymentsController } from './admin-billing.controller';
import { PublicBillingController } from './public-billing.controller';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@Module({
  imports: [CreditsModule],
  controllers: [BillingController, AamarPayReturnController, PayPalReturnController, PaymentAccountsController, AdminPaymentsController, AdminBillingConfigController, PublicBillingController],
  providers: [BillingService, BillingConfigService, AamarPayClient, PayPalClient, PaymentAccountsService, GatewayReconcilerService, mailerProvider, RateLimitGuard],
  exports: [BillingService],
})
export class BillingModule {}
