import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Mailer } from '@foxindex/auth';
import { creditPacks, paymentMethods, payments, users, type Database } from '@foxindex/database';
import type { CreatePaymentInput, RejectPaymentInput } from '@foxindex/validation';
import { ErrorCode, UserRole } from '@foxindex/types';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { MAILER } from '../auth/mailer.provider';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreditsRepository } from '../credits/credits.repository';
import { AamarPayClient } from './aamarpay.client';
import { PaymentAccountsService } from './payment-accounts.service';
import { PayPalApiError, PayPalClient, type CaptureResult } from './paypal.client';
import { paymentApprovedEmail, paymentRejectedEmail, paymentSubmittedEmail } from './billing-emails';
import { quote, type Currency, type Quote } from './pricing';

/** Manual payments above this (BDT) need an admin, not just the client's manager. */
export const MANAGER_APPROVAL_LIMIT_BDT = 10_000;
const GATEWAY_CHECKOUT_TTL_MS = 60 * 60 * 1000;

type Actor = { id: string; role: UserRole };
type PaymentStatus = (typeof payments.$inferSelect)['status'];

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
    @Inject(AamarPayClient) private readonly aamarpay: AamarPayClient,
    @Inject(PayPalClient) private readonly paypal: PayPalClient,
    @Inject(PaymentAccountsService) private readonly accounts: PaymentAccountsService,
  ) {}

  // ── Catalog ────────────────────────────────────────────────────────────

  listActivePacks() {
    return this.db
      .select()
      .from(creditPacks)
      .where(eq(creditPacks.isActive, true))
      .orderBy(asc(creditPacks.credits));
  }

  /** Client-facing: never leaks gateway config. Gateway methods are hidden when the gateway isn't configured. */
  async listActiveMethods() {
    const rows = await this.db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.isActive, true))
      .orderBy(asc(paymentMethods.sortOrder));
    const gatewayReady = this.aamarpay.config() !== null;
    const paypalReady = this.paypal.config() !== null;
    return rows.map((m) => ({
      id: m.id,
      type: m.type,
      label: m.label,
      network: m.network,
      isManual: m.isManual,
      gateway: m.gateway,
      feePercent: Number(m.feePercent),
      available: m.isManual || (m.gateway === 'aamarpay' && gatewayReady) || (m.gateway === 'paypal' && paypalReady),
      /** PayPal only settles in US dollars. */
      usdOnly: m.gateway === 'paypal',
      accountNumber: m.isManual ? m.accountNumber : null,
      accountName: m.isManual ? m.accountName : null,
      bankName: m.isManual ? m.bankName : null,
      branch: m.isManual ? m.branch : null,
      instructions: m.instructions,
    }));
  }

  async quote(input: { packId?: string; credits?: number; methodId?: string; currency: Currency }): Promise<Quote> {
    const method = input.methodId
      ? await this.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.methodId) })
      : undefined;
    const packs = await this.listActivePacks();
    const result = quote(
      { packId: input.packId, credits: input.credits, currency: input.currency, feePercent: Number(method?.feePercent ?? 0) },
      packs,
    );
    if (!result) throw new NotFoundError('Credit pack');
    return result;
  }

  // ── Client payments ────────────────────────────────────────────────────

  async createPayment(userId: string, input: CreatePaymentInput) {
    const method = await this.db.query.paymentMethods.findFirst({
      where: and(eq(paymentMethods.id, input.methodId), eq(paymentMethods.isActive, true)),
    });
    if (!method) throw new NotFoundError('Payment method');

    const q = await this.quote({ ...input, currency: input.currency });
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User');

    if (method.isManual) {
      if (!input.transactionId) {
        throw new ValidationError('Enter the transaction ID from your receipt', { reason: 'TRANSACTION_ID_REQUIRED' });
      }
      const payment = await this.insertPayment({
        userId,
        methodId: method.id,
        quote: q,
        status: 'under_review',
        transactionId: input.transactionId,
        senderNumber: input.senderNumber,
      });
      await this.auditLog.record({ actorId: userId, action: 'payment.submit', targetType: 'payment', targetId: payment.id, metadata: { reference: payment.reference, amount: payment.amount } });
      void this.notifyManagerOfSubmission(user, payment.reference, `${q.currency} ${q.total.toFixed(2)}`);
      return { payment: this.toClientPayment(payment, method.label), redirectUrl: null };
    }

    if (method.gateway === 'paypal') return this.startPayPal(user, method, q, input);

    const cfg = this.aamarpay.config();
    if (method.gateway !== 'aamarpay' || !cfg) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Online payments are not available right now. Choose bank transfer or message your manager.', {
        reason: 'GATEWAY_NOT_CONFIGURED',
      });
    }

    const payment = await this.insertPayment({
      userId,
      methodId: method.id,
      quote: q,
      status: 'pending',
      expiresAt: new Date(Date.now() + GATEWAY_CHECKOUT_TTL_MS),
    });

    const apiUrl = this.config.getOrThrow<string>('API_PUBLIC_URL');
    const returnBase = `${apiUrl}/api/v1/billing/aamarpay/return?ref=${encodeURIComponent(payment.reference)}`;
    try {
      const redirectUrl = await this.aamarpay.initiate(cfg, {
        tranId: payment.reference,
        amount: q.total.toFixed(2),
        currency: q.currency,
        description: `${q.credits} FoxIndex credits`,
        customer: { name: user.name, email: user.email, phone: user.phone ?? user.whatsapp ?? '01700000000' },
        successUrl: `${returnBase}&outcome=success`,
        failUrl: `${returnBase}&outcome=fail`,
        cancelUrl: `${returnBase}&outcome=cancel`,
      });
      return { payment: this.toClientPayment(payment, method.label), redirectUrl };
    } catch (error) {
      this.logger.error(`aamarPay initiate failed for ${payment.reference}: ${(error as Error).message}`);
      await this.db.update(payments).set({ status: 'expired' }).where(eq(payments.id, payment.id));
      throw new AppError(ErrorCode.PROVIDER_ERROR, 'The payment gateway did not respond. Please try again in a minute.');
    }
  }

  private async insertPayment(input: {
    userId: string;
    methodId: string;
    quote: Quote;
    status: PaymentStatus;
    transactionId?: string;
    senderNumber?: string;
    expiresAt?: Date;
    saveMethod?: boolean;
  }) {
    const seq = await this.db.execute<{ n: string }>(sql`SELECT nextval('payment_reference_seq') AS n`);
    const reference = `PAY-${seq.rows[0].n}`;
    try {
      const [row] = await this.db
        .insert(payments)
        .values({
          reference,
          userId: input.userId,
          methodId: input.methodId,
          packId: input.quote.packId,
          credits: input.quote.credits,
          amount: input.quote.total.toFixed(2),
          currency: input.quote.currency,
          status: input.status,
          transactionId: input.transactionId,
          senderNumber: input.senderNumber,
          expiresAt: input.expiresAt,
          saveMethod: input.saveMethod ?? false,
        })
        .returning();
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ValidationError('This transaction ID has already been submitted', { reason: 'TRANSACTION_ID_USED' });
      }
      throw error;
    }
  }

  async listMyPayments(userId: string) {
    const rows = await this.db
      .select({ payment: payments, methodLabel: paymentMethods.label })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(50);
    return rows.map((r) => this.toClientPayment(r.payment, r.methodLabel));
  }

  async getMyPayment(userId: string, reference: string) {
    const [row] = await this.db
      .select({ payment: payments, methodLabel: paymentMethods.label })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .where(and(eq(payments.userId, userId), eq(payments.reference, reference)));
    if (!row) throw new NotFoundError('Payment');
    return this.toClientPayment(row.payment, row.methodLabel);
  }

  private toClientPayment(p: typeof payments.$inferSelect, methodLabel: string) {
    return {
      id: p.id,
      reference: p.reference,
      credits: p.credits,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      methodLabel,
      transactionId: p.transactionId,
      rejectReason: p.rejectReason,
      createdAt: p.createdAt,
      reviewedAt: p.reviewedAt,
    };
  }

  // ── Gateway return ─────────────────────────────────────────────────────

  /** Idempotent: a duplicate callback finds the payment already approved and changes nothing. */
  async handleAamarPayReturn(reference: string, outcome: string): Promise<'approved' | 'failed' | 'pending'> {
    const payment = await this.db.query.payments.findFirst({ where: eq(payments.reference, reference) });
    if (!payment) return 'failed';
    if (payment.status === 'approved') return 'approved';

    const cfg = this.aamarpay.config();
    if (!cfg) return 'failed';

    const result = await this.aamarpay.verify(cfg, reference).catch((error: Error) => {
      this.logger.error(`aamarPay verify failed for ${reference}: ${error.message}`);
      return null;
    });
    if (!result) return 'pending';

    const amountOk = result.amount + 0.01 >= Number(payment.amount);
    const currencyOk = !result.currency || result.currency.toUpperCase() === payment.currency;
    if (result.paid && amountOk && currencyOk) {
      await this.approveInternal(payment.id, null, `Gateway ${result.gatewayTxnId ?? ''}`.trim(), result.raw);
      return 'approved';
    }

    if (outcome !== 'success' || !result.paid) {
      await this.db
        .update(payments)
        .set({ status: 'rejected', rejectReason: outcome === 'cancel' ? 'Checkout cancelled' : 'Payment failed at gateway', gatewayPayload: result.raw })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
      return 'failed';
    }

    this.logger.warn(`aamarPay amount/currency mismatch on ${reference}`);
    await this.db.update(payments).set({ status: 'under_review', gatewayPayload: result.raw }).where(eq(payments.id, payment.id));
    return 'pending';
  }

  // ── PayPal ─────────────────────────────────────────────────────────────

  private async startPayPal(user: typeof users.$inferSelect, method: typeof paymentMethods.$inferSelect, q: Quote, input: CreatePaymentInput) {
    const cfg = this.paypal.config();
    if (!cfg) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'PayPal is not available right now. Choose another method or message your manager.', { reason: 'GATEWAY_NOT_CONFIGURED' });
    }
    if (q.currency !== 'USD') throw new ValidationError('PayPal charges in US dollars — switch the currency to USD', { reason: 'USD_ONLY' });

    const saved = input.savedMethodId ? await this.accounts.vaultedFor(user.id, input.savedMethodId) : null;
    const vault = !saved && input.saveMethod;
    const payment = await this.insertPayment({
      userId: user.id,
      methodId: method.id,
      quote: q,
      status: 'pending',
      expiresAt: new Date(Date.now() + GATEWAY_CHECKOUT_TTL_MS),
      saveMethod: vault,
    });
    await this.auditLog.record({ actorId: user.id, action: 'payment.start', targetType: 'payment', targetId: payment.id, metadata: { reference: payment.reference, gateway: 'paypal', saved: Boolean(saved) } });

    const apiUrl = this.config.getOrThrow<string>('API_PUBLIC_URL');
    const returnBase = `${apiUrl}/api/v1/billing/paypal/return?ref=${encodeURIComponent(payment.reference)}`;
    let order;
    try {
      order = await this.paypal.createOrder(cfg, {
        reference: payment.reference,
        amount: q.total.toFixed(2),
        description: `${q.credits} FoxIndex credits`,
        returnUrl: `${returnBase}&outcome=success`,
        cancelUrl: `${returnBase}&outcome=cancel`,
        vault,
        customerId: saved?.providerCustomerId ?? (vault ? await this.accounts.paypalCustomerId(user.id) : null),
        saved: saved?.providerToken ? { kind: saved.type === 'card' ? 'card' : 'paypal', token: saved.providerToken } : null,
      });
    } catch (error) {
      this.logger.error(`PayPal order failed for ${payment.reference}: ${(error as Error).message}`);
      const declined = saved && error instanceof PayPalApiError && error.status < 500;
      await this.db
        .update(payments)
        .set(declined ? { status: 'rejected', rejectReason: 'Saved method was declined' } : { status: 'expired' })
        .where(eq(payments.id, payment.id));
      throw declined
        ? new ValidationError('PayPal declined the saved method. Try another card or pay without saving.', { reason: 'SAVED_METHOD_DECLINED' })
        : new AppError(ErrorCode.PROVIDER_ERROR, 'PayPal did not respond. Please try again in a minute.');
    }
    await this.db.update(payments).set({ gatewayOrderId: order.id }).where(eq(payments.id, payment.id));

    // A saved method is charged straight away — no redirect.
    if (order.capture) {
      const result = await this.settlePayPal(payment.id, order.capture);
      const fresh = await this.db.query.payments.findFirst({ where: eq(payments.id, payment.id) });
      if (result === 'failed') throw new ValidationError('PayPal declined the payment. Try another method.', { reason: 'PAYMENT_DECLINED' });
      return { payment: this.toClientPayment(fresh ?? payment, method.label), redirectUrl: null };
    }
    if (!order.approveUrl) {
      await this.db.update(payments).set({ status: 'expired' }).where(eq(payments.id, payment.id));
      throw new AppError(ErrorCode.PROVIDER_ERROR, 'PayPal did not start the checkout. Please try again.');
    }
    return { payment: this.toClientPayment(payment, method.label), redirectUrl: order.approveUrl };
  }

  /**
   * Apply a PayPal capture to a payment: credit it when PayPal says COMPLETED for the
   * full USD amount, hold it for review on a mismatch, reject it when declined.
   */
  private async settlePayPal(paymentId: string, capture: CaptureResult): Promise<'approved' | 'failed' | 'pending'> {
    const payment = await this.db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
    if (!payment) return 'failed';
    if (payment.status === 'approved') return 'approved';
    if (payment.status !== 'pending') return 'failed';

    if (capture.completed) {
      const amountOk = capture.amount + 0.01 >= Number(payment.amount);
      const currencyOk = (capture.currency ?? '').toUpperCase() === 'USD';
      if (amountOk && currencyOk) {
        if (capture.captureId) {
          await this.db
            .update(payments)
            .set({ transactionId: capture.captureId })
            .where(and(eq(payments.id, payment.id), sql`${payments.transactionId} IS NULL`))
            .catch((error: unknown) => this.logger.warn(`PayPal capture id not stored on ${payment.reference}: ${(error as Error).message}`));
        }
        await this.approveInternal(payment.id, null, `PayPal ${capture.captureId ?? ''}`.trim(), capture.raw);
        if (payment.saveMethod && capture.vault) {
          await this.accounts.saveVaulted(payment.userId, capture.vault).catch((error: Error) => this.logger.warn(`Could not save PayPal method: ${error.message}`));
        }
        return 'approved';
      }
      this.logger.warn(`PayPal amount/currency mismatch on ${payment.reference}`);
      await this.db.update(payments).set({ status: 'under_review', gatewayPayload: capture.raw }).where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
      return 'pending';
    }
    if (capture.status === 'DECLINED' || capture.status === 'FAILED') {
      await this.db
        .update(payments)
        .set({ status: 'rejected', rejectReason: 'Payment was declined by PayPal', gatewayPayload: capture.raw })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
      return 'failed';
    }
    // PENDING (e.g. an eCheck or a PayPal risk review) — the background check picks it up later.
    return 'pending';
  }

  /** Shopper came back from PayPal. Nothing in the redirect is trusted: we capture server-to-server. */
  async handlePayPalReturn(reference: string, outcome: string): Promise<'approved' | 'failed' | 'pending'> {
    const payment = await this.db.query.payments.findFirst({ where: eq(payments.reference, reference) });
    if (!payment) return 'failed';
    if (payment.status === 'approved') return 'approved';
    if (payment.status !== 'pending') return 'failed';
    const cfg = this.paypal.config();
    if (!cfg || !payment.gatewayOrderId) return 'failed';

    if (outcome === 'cancel') {
      await this.db.update(payments).set({ status: 'rejected', rejectReason: 'Checkout cancelled' }).where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
      return 'failed';
    }
    try {
      return await this.settlePayPal(payment.id, await this.paypal.captureOrder(cfg, payment.gatewayOrderId));
    } catch (error) {
      this.logger.warn(`PayPal capture failed for ${reference}: ${(error as Error).message}`);
      if (error instanceof PayPalApiError && error.issue === 'INSTRUMENT_DECLINED') {
        await this.db
          .update(payments)
          .set({ status: 'rejected', rejectReason: 'Payment was declined by PayPal' })
          .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
        return 'failed';
      }
      return 'pending';
    }
  }

  /** Background re-check of a PayPal order the shopper may have approved without coming back. */
  private async reconcilePayPal(payment: typeof payments.$inferSelect): Promise<'approved' | 'expired' | 'pending' | 'review'> {
    const cfg = this.paypal.config();
    if (!cfg || !payment.gatewayOrderId) return 'pending';
    const order = await this.paypal.getOrder(cfg, payment.gatewayOrderId).catch((error: Error) => {
      this.logger.warn(`PayPal reconcile lookup failed for ${payment.reference}: ${error.message}`);
      return null;
    });
    if (!order) return 'pending';
    const status = String(order.status ?? '');
    let result: 'approved' | 'failed' | 'pending' = 'pending';
    if (status === 'COMPLETED') result = await this.settlePayPal(payment.id, this.paypal.orderCapture(order));
    else if (status === 'APPROVED') {
      result = await this.paypal
        .captureOrder(cfg, payment.gatewayOrderId)
        .then((capture) => this.settlePayPal(payment.id, capture))
        .catch(() => 'pending' as const);
    }
    if (result === 'approved') return 'approved';
    const fresh = await this.db.query.payments.findFirst({ where: eq(payments.id, payment.id), columns: { status: true } });
    if (fresh?.status === 'under_review') return 'review';
    if (fresh?.status === 'pending' && payment.expiresAt && payment.expiresAt.getTime() < Date.now() && status !== 'APPROVED' && status !== 'COMPLETED') {
      await this.db.update(payments).set({ status: 'expired' }).where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
      return 'expired';
    }
    return 'pending';
  }

  /**
   * Background re-check for a checkout whose shopper never came back (closed the
   * tab, lost connection). Credits it if the gateway confirms payment; expires it once
   * the checkout window has passed. Safe to repeat — approval is idempotent.
   */
  async reconcileGatewayPayment(reference: string): Promise<'approved' | 'expired' | 'pending' | 'review'> {
    const payment = await this.db.query.payments.findFirst({ where: eq(payments.reference, reference) });
    if (payment?.status === 'pending' && payment.gatewayOrderId) return this.reconcilePayPal(payment);
    const cfg = this.aamarpay.config();
    if (!payment || payment.status !== 'pending' || !cfg) return 'pending';

    const result = await this.aamarpay.verify(cfg, reference).catch((error: Error) => {
      this.logger.warn(`aamarPay reconcile verify failed for ${reference}: ${error.message}`);
      return null;
    });
    if (result?.paid) {
      const amountOk = result.amount + 0.01 >= Number(payment.amount);
      const currencyOk = !result.currency || result.currency.toUpperCase() === payment.currency;
      if (amountOk && currencyOk) {
        await this.approveInternal(payment.id, null, `Gateway ${result.gatewayTxnId ?? ''} · confirmed in background`.trim(), result.raw);
        return 'approved';
      }
      this.logger.warn(`aamarPay amount/currency mismatch on ${reference} (background check)`);
      await this.db.update(payments).set({ status: 'under_review', gatewayPayload: result.raw }).where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
      return 'review';
    }
    // Unpaid (or gateway unreachable) — keep trying until the checkout window closes.
    if (result && payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
      await this.db.update(payments).set({ status: 'expired', gatewayPayload: result.raw }).where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')));
      return 'expired';
    }
    return 'pending';
  }

  /** References of gateway checkouts still waiting for a result, oldest first. */
  async pendingGatewayReferences(limit = 50): Promise<string[]> {
    const rows = await this.db.execute<{ reference: string }>(sql`
      SELECT p.reference FROM ${payments} p JOIN ${paymentMethods} m ON m.id = p.method_id
      WHERE p.status = 'pending' AND m.gateway IN ('aamarpay', 'paypal')
        AND p.created_at < now() - interval '2 minutes'
        AND p.created_at > now() - interval '3 days'
      ORDER BY p.created_at ASC
      LIMIT ${limit}
    `);
    return rows.rows.map((r) => r.reference);
  }

  // ── Staff review ───────────────────────────────────────────────────────

  async listForStaff(actor: Actor, status?: PaymentStatus) {
    const where = and(
      status ? eq(payments.status, status) : undefined,
      actor.role === UserRole.MANAGER ? eq(users.assignedManagerId, actor.id) : undefined,
    );
    const rows = await this.db
      .select({
        payment: payments,
        methodLabel: paymentMethods.label,
        methodType: paymentMethods.type,
        clientId: users.id,
        clientName: users.name,
        clientEmail: users.email,
      })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.userId))
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(200);

    return rows.map((r) => ({
      ...this.toClientPayment(r.payment, r.methodLabel),
      methodType: r.methodType,
      senderNumber: r.payment.senderNumber,
      client: { id: r.clientId, name: r.clientName, email: r.clientEmail },
      needsAdmin: r.payment.currency === 'BDT' && Number(r.payment.amount) > MANAGER_APPROVAL_LIMIT_BDT,
    }));
  }

  private async loadForReview(actor: Actor, paymentId: string) {
    const [row] = await this.db
      .select({ payment: payments, client: users })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.userId))
      .where(eq(payments.id, paymentId));
    if (!row) throw new NotFoundError('Payment');

    if (actor.role === UserRole.MANAGER) {
      if (row.client.assignedManagerId !== actor.id) throw new AuthorizationError();
      if (row.payment.currency === 'BDT' && Number(row.payment.amount) > MANAGER_APPROVAL_LIMIT_BDT) {
        throw new AuthorizationError(`Payments over ৳${MANAGER_APPROVAL_LIMIT_BDT.toLocaleString()} need an admin to approve`);
      }
    }
    if (!['pending', 'under_review'].includes(row.payment.status)) {
      throw new ValidationError('This payment has already been reviewed', { reason: 'ALREADY_REVIEWED' });
    }
    return row;
  }

  async approve(actor: Actor, paymentId: string) {
    const { payment } = await this.loadForReview(actor, paymentId);
    const balance = await this.approveInternal(payment.id, actor.id, payment.transactionId ? `TrxID ${payment.transactionId}` : undefined);
    return { id: payment.id, status: 'approved' as const, balance };
  }

  /** Status flip is the idempotency guard: only one caller can move pending/under_review → approved. */
  private async approveInternal(paymentId: string, reviewerId: string | null, note?: string, gatewayPayload?: unknown) {
    const outcome = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(payments)
        .set({
          status: 'approved',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          ...(gatewayPayload ? { gatewayPayload } : {}),
        })
        .where(and(eq(payments.id, paymentId), inArray(payments.status, ['pending', 'under_review'])))
        .returning();
      if (!updated) return null;

      const balance = await this.credits.apply(updated.userId, updated.credits, 'payment_credit', {
        performedBy: reviewerId ?? undefined,
        note: [updated.reference, note].filter(Boolean).join(' · '),
        referenceId: updated.id,
        tx,
      });
      await this.auditLog.record(
        {
          actorId: reviewerId ?? undefined,
          action: 'payment.approve',
          targetType: 'payment',
          targetId: updated.id,
          metadata: { reference: updated.reference, credits: updated.credits, amount: updated.amount, userId: updated.userId },
        },
        tx,
      );
      return { payment: updated, balance };
    });

    if (!outcome) return null;
    void this.notifyClient(outcome.payment.userId, (name) =>
      paymentApprovedEmail(name, outcome.payment.reference, outcome.payment.credits, outcome.balance),
    );
    return outcome.balance;
  }

  async reject(actor: Actor, paymentId: string, input: RejectPaymentInput) {
    const { payment } = await this.loadForReview(actor, paymentId);
    const [updated] = await this.db
      .update(payments)
      .set({ status: 'rejected', rejectReason: input.reason, reviewedBy: actor.id, reviewedAt: new Date() })
      .where(and(eq(payments.id, payment.id), inArray(payments.status, ['pending', 'under_review'])))
      .returning();
    if (!updated) throw new ValidationError('This payment has already been reviewed', { reason: 'ALREADY_REVIEWED' });

    await this.auditLog.record({ actorId: actor.id, action: 'payment.reject', targetType: 'payment', targetId: payment.id, metadata: { reference: payment.reference, reason: input.reason } });
    void this.notifyClient(payment.userId, (name) => paymentRejectedEmail(name, payment.reference, input.reason));
    return { id: payment.id, status: 'rejected' as const };
  }

  async staffStats(actor: Actor) {
    const scope = actor.role === UserRole.MANAGER ? sql`AND u.assigned_manager_id = ${actor.id}` : sql``;
    const result = await this.db.execute<{
      collected_bdt: string;
      approved_count: string;
      pending_count: string;
      stale_count: string;
    }>(sql`
      SELECT
        coalesce(sum(p.amount) FILTER (WHERE p.status = 'approved' AND p.currency = 'BDT' AND p.reviewed_at >= date_trunc('month', now())), 0) AS collected_bdt,
        count(*) FILTER (WHERE p.status = 'approved' AND p.reviewed_at >= date_trunc('month', now())) AS approved_count,
        count(*) FILTER (WHERE p.status = 'under_review') AS pending_count,
        count(*) FILTER (WHERE p.status = 'under_review' AND p.created_at < now() - interval '3 hours') AS stale_count
      FROM ${payments} p JOIN ${users} u ON u.id = p.user_id
      WHERE true ${scope}
    `);
    const r = result.rows[0];
    return {
      collectedBdtThisMonth: Number(r?.collected_bdt ?? 0),
      approvedThisMonth: Number(r?.approved_count ?? 0),
      pendingReview: Number(r?.pending_count ?? 0),
      pendingOverThreeHours: Number(r?.stale_count ?? 0),
    };
  }

  // ── Notifications (best-effort; never fail the request) ────────────────

  private async notifyClient(userId: string, build: (name: string) => { subject: string; html: string }) {
    try {
      const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true, email: true } });
      if (!user) return;
      const mail = build(user.name);
      await this.mailer.send(user.email, mail.subject, mail.html);
    } catch (error) {
      this.logger.warn(`payment email failed: ${(error as Error).message}`);
    }
  }

  private async notifyManagerOfSubmission(client: typeof users.$inferSelect, reference: string, amount: string) {
    try {
      if (!client.assignedManagerId) return;
      const manager = await this.db.query.users.findFirst({ where: eq(users.id, client.assignedManagerId), columns: { name: true, email: true } });
      if (!manager) return;
      const mail = paymentSubmittedEmail(manager.name, client.name, reference, amount);
      await this.mailer.send(manager.email, mail.subject, mail.html);
    } catch (error) {
      this.logger.warn(`manager notification failed: ${(error as Error).message}`);
    }
  }
}
