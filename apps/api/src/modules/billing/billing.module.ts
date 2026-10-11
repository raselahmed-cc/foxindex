import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { mailerProvider } from '../auth/mailer.provider';
import { AamarPayClient } from './aamarpay.client';
import { BillingService } from './billing.service';
import { BillingConfigService } from './billing-config.service';
import { AamarPayReturnController, BillingController } from './billing.controller';
import { AdminBillingConfigController, AdminPaymentsController } from './admin-billing.controller';

@Module({
  imports: [CreditsModule],
  controllers: [BillingController, AamarPayReturnController, AdminPaymentsController, AdminBillingConfigController],
  providers: [BillingService, BillingConfigService, AamarPayClient, mailerProvider],
  exports: [BillingService],
})
export class BillingModule {}
