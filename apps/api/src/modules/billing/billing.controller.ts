import { Body, Controller, Get, Inject, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  createPaymentSchema,
  quotePaymentSchema,
  type CreatePaymentInput,
  type QuotePaymentInput,
} from '@foxindex/validation';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get('packs')
  packs() {
    return this.billing.listActivePacks();
  }

  @Get('methods')
  methods() {
    return this.billing.listActiveMethods();
  }

  @Get('quote')
  quote(@Query(new ZodValidationPipe(quotePaymentSchema)) query: QuotePaymentInput) {
    return this.billing.quote(query);
  }

  @Get('payments')
  myPayments(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.billing.listMyPayments(user.id);
  }

  @Get('payments/:reference')
  myPayment(@CurrentUser() user: AuthenticatedRequest['user'], @Param('reference') reference: string) {
    return this.billing.getMyPayment(user.id, reference);
  }

  @Post('payments')
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
  ) {
    return this.billing.createPayment(user.id, body);
  }
}

/**
 * Unauthenticated on purpose: aamarPay redirects the shopper's browser here
 * (POST form or GET). Nothing in the request is trusted — the service
 * re-verifies the transaction server-to-server before crediting.
 */
@Controller('billing/aamarpay')
export class AamarPayReturnController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Post('return')
  async returnPost(@Query('ref') ref: string, @Query('outcome') outcome: string, @Res() res: Response) {
    return this.finish(ref, outcome, res);
  }

  @Get('return')
  async returnGet(@Query('ref') ref: string, @Query('outcome') outcome: string, @Res() res: Response) {
    return this.finish(ref, outcome, res);
  }

  private async finish(ref: string, outcome: string, res: Response) {
    const webOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
    const reference = /^PAY-\d+$/.test(ref ?? '') ? ref : '';
    const result = reference ? await this.billing.handleAamarPayReturn(reference, outcome ?? '') : 'failed';
    const target = new URL('/billing/buy', webOrigin);
    target.searchParams.set('payment', reference);
    target.searchParams.set('result', result);
    res.redirect(303, target.toString());
  }
}

/**
 * PayPal sends the shopper back here (GET) after approving or cancelling. The
 * redirect proves nothing — the service captures the order server-to-server.
 */
@Controller('billing/paypal')
export class PayPalReturnController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get('return')
  async paypalReturn(@Query('ref') ref: string, @Query('outcome') outcome: string, @Res() res: Response) {
    const webOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
    const reference = /^PAY-\d+$/.test(ref ?? '') ? ref : '';
    const result = reference ? await this.billing.handlePayPalReturn(reference, outcome ?? '') : 'failed';
    const target = new URL('/billing/buy', webOrigin);
    target.searchParams.set('payment', reference);
    target.searchParams.set('result', result);
    res.redirect(303, target.toString());
  }
}
