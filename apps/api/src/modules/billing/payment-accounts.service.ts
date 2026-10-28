import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type IORedis from 'ioredis';
import { userPaymentAccounts, type Database } from '@foxindex/database';
import type { AddPaymentAccountInput, UpdatePaymentAccountInput, StartVaultInput } from '@foxindex/validation';
import { ErrorCode } from '@foxindex/types';
import { AppError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { PayPalApiError, PayPalClient, type VaultedMethod } from './paypal.client';

type AccountRow = typeof userPaymentAccounts.$inferSelect;
const MAX_ACCOUNTS = 20;
const SETUP_TTL_S = 60 * 60;
const setupKey = (id: string) => `paypal-setup:${id}`;

/**
 * A client's saved payment methods. Wallet numbers and bank accounts are plain
 * details that prefill manual payments. PayPal accounts and cards live in
 * PayPal's vault — we hold only the token, so card data never reaches us.
 */
@Injectable()
export class PaymentAccountsService {
  private readonly logger = new Logger(PaymentAccountsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PayPalClient) private readonly paypal: PayPalClient,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  /** The vault token never leaves the server. */
  private toDto(r: AccountRow) {
    return {
      id: r.id,
      type: r.type,
      label: r.label,
      display: r.accountNumber,
      isDefault: Boolean(r.isDefault),
      provider: r.provider,
      brand: r.brand,
      last4: r.last4,
      expiry: r.expiry,
      bankName: r.bankName,
      accountName: r.accountName,
      createdAt: r.createdAt,
    };
  }

  async list(userId: string) {
    const rows = await this.db.select().from(userPaymentAccounts).where(eq(userPaymentAccounts.userId, userId)).orderBy(asc(userPaymentAccounts.createdAt));
    return rows.map((r) => this.toDto(r));
  }

  /** For checkout: the saved PayPal/card token, only if it belongs to this client. */
  async vaultedFor(userId: string, id: string): Promise<AccountRow> {
    const row = await this.db.query.userPaymentAccounts.findFirst({
      where: and(eq(userPaymentAccounts.id, id), eq(userPaymentAccounts.userId, userId), eq(userPaymentAccounts.provider, 'paypal'), isNotNull(userPaymentAccounts.providerToken)),
    });
    if (!row) throw new NotFoundError('Saved payment method');
    return row;
  }

  /** PayPal groups a client's vaulted methods under one customer id; reuse it once we have one. */
  async paypalCustomerId(userId: string): Promise<string | null> {
    const row = await this.db.query.userPaymentAccounts.findFirst({
      where: and(eq(userPaymentAccounts.userId, userId), isNotNull(userPaymentAccounts.providerCustomerId)),
      columns: { providerCustomerId: true },
    });
    return row?.providerCustomerId ?? null;
  }

  private async ensureRoom(userId: string) {
    const [{ n }] = await this.db.select({ n: sql<string>`count(*)` }).from(userPaymentAccounts).where(eq(userPaymentAccounts.userId, userId));
    if (Number(n) >= MAX_ACCOUNTS) throw new ValidationError(`You can save up to ${MAX_ACCOUNTS} payment methods — remove one first`);
  }

  private async hasDefault(userId: string): Promise<boolean> {
    const row = await this.db.query.userPaymentAccounts.findFirst({ where: and(eq(userPaymentAccounts.userId, userId), eq(userPaymentAccounts.isDefault, true)), columns: { id: true } });
    return Boolean(row);
  }

  async addManual(userId: string, input: AddPaymentAccountInput) {
    await this.ensureRoom(userId);
    const makeDefault = input.isDefault || !(await this.hasDefault(userId));
    const row = await this.db.transaction(async (tx) => {
      if (makeDefault) await tx.update(userPaymentAccounts).set({ isDefault: false }).where(eq(userPaymentAccounts.userId, userId));
      const [created] = await tx
        .insert(userPaymentAccounts)
        .values({
          userId,
          type: input.type,
          accountNumber: input.accountNumber,
          label: input.label || null,
          bankName: input.type === 'bank' ? input.bankName || null : null,
          accountName: input.type === 'bank' ? input.accountName || null : null,
          isDefault: makeDefault,
        })
        .returning();
      return created;
    });
    await this.auditLog.record({ actorId: userId, action: 'payment_account.add', targetType: 'user_payment_account', targetId: row.id, metadata: { type: row.type } });
    return this.toDto(row);
  }

  /** Called after a PayPal checkout or vault setup. Skips tokens we already have. */
  async saveVaulted(userId: string, v: VaultedMethod) {
    const existing = await this.db.query.userPaymentAccounts.findFirst({ where: and(eq(userPaymentAccounts.userId, userId), eq(userPaymentAccounts.providerToken, v.token)) });
    if (existing) return this.toDto(existing);
    await this.ensureRoom(userId);
    const makeDefault = !(await this.hasDefault(userId));
    const brand = v.brand ? v.brand.charAt(0) + v.brand.slice(1).toLowerCase() : 'Card';
    const [row] = await this.db
      .insert(userPaymentAccounts)
      .values({
        userId,
        type: v.kind === 'card' ? 'card' : 'paypal',
        accountNumber: v.kind === 'card' ? `•••• ${v.last4 ?? ''}`.trim() : (v.email ?? 'PayPal account'),
        label: v.kind === 'card' ? `${brand} •••• ${v.last4 ?? ''}`.trim() : 'PayPal',
        provider: 'paypal',
        providerToken: v.token,
        providerCustomerId: v.customerId,
        brand: v.brand,
        last4: v.last4,
        expiry: v.expiry,
        isDefault: makeDefault,
      })
      .returning();
    await this.auditLog.record({ actorId: userId, action: 'payment_account.vault', targetType: 'user_payment_account', targetId: row.id, metadata: { kind: v.kind, last4: v.last4 } });
    return this.toDto(row);
  }

  async update(userId: string, id: string, input: UpdatePaymentAccountInput) {
    const row = await this.db.transaction(async (tx) => {
      if (input.isDefault) await tx.update(userPaymentAccounts).set({ isDefault: false }).where(eq(userPaymentAccounts.userId, userId));
      const [updated] = await tx
        .update(userPaymentAccounts)
        .set({ ...(input.label !== undefined ? { label: input.label || null } : {}), ...(input.isDefault ? { isDefault: true } : {}) })
        .where(and(eq(userPaymentAccounts.id, id), eq(userPaymentAccounts.userId, userId)))
        .returning();
      if (!updated) throw new NotFoundError('Saved payment method');
      return updated;
    });
    return this.toDto(row);
  }

  async remove(userId: string, id: string) {
    const [row] = await this.db.delete(userPaymentAccounts).where(and(eq(userPaymentAccounts.id, id), eq(userPaymentAccounts.userId, userId))).returning();
    if (!row) throw new NotFoundError('Saved payment method');
    // Also forget it at PayPal; if that fails the token is unusable to anyone but us anyway.
    const cfg = this.paypal.config();
    if (row.provider === 'paypal' && row.providerToken && cfg) {
      await this.paypal.deletePaymentToken(cfg, row.providerToken).catch((error: Error) => this.logger.warn(`PayPal token delete failed: ${error.message}`));
    }
    if (row.isDefault) {
      const next = await this.db.query.userPaymentAccounts.findFirst({ where: eq(userPaymentAccounts.userId, userId), orderBy: asc(userPaymentAccounts.createdAt) });
      if (next) await this.db.update(userPaymentAccounts).set({ isDefault: true }).where(eq(userPaymentAccounts.id, next.id));
    }
    await this.auditLog.record({ actorId: userId, action: 'payment_account.remove', targetType: 'user_payment_account', targetId: id, metadata: { type: row.type } });
    return { id };
  }

  // ── PayPal vault (save without paying) ─────────────────────────────────

  /** Public SDK settings for the hosted card fields. The client id is not a secret. */
  paypalConfig() {
    const cfg = this.paypal.config();
    return { enabled: cfg !== null, clientId: cfg?.clientId ?? null, sandbox: cfg?.sandbox ?? true };
  }

  async startVault(userId: string, input: StartVaultInput) {
    const cfg = this.paypal.config();
    if (!cfg) throw new AppError(ErrorCode.VALIDATION_ERROR, 'PayPal is not available yet', { reason: 'GATEWAY_NOT_CONFIGURED' });
    await this.ensureRoom(userId);
    const webOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
    const setup = await this.paypal
      .createSetupToken(cfg, {
        kind: input.kind,
        customerId: await this.paypalCustomerId(userId),
        returnUrl: `${webOrigin}/billing/methods?vault=return`,
        cancelUrl: `${webOrigin}/billing/methods?vault=cancel`,
      })
      .catch((error: Error) => {
        this.logger.error(`PayPal setup token failed: ${error.message}`);
        throw new AppError(ErrorCode.PROVIDER_ERROR, 'PayPal did not respond. Please try again in a minute.');
      });
    // Remember who started it, so only this client can finish it.
    await this.redis.set(setupKey(setup.id), userId, 'EX', SETUP_TTL_S);
    return { setupTokenId: setup.id, approveUrl: setup.approveUrl };
  }

  async confirmVault(userId: string, setupTokenId: string) {
    const cfg = this.paypal.config();
    if (!cfg) throw new AppError(ErrorCode.VALIDATION_ERROR, 'PayPal is not available yet', { reason: 'GATEWAY_NOT_CONFIGURED' });
    const owner = await this.redis.get(setupKey(setupTokenId));
    if (owner !== userId) throw new NotFoundError('Pending PayPal setup');
    const vaulted = await this.paypal.createPaymentToken(cfg, setupTokenId).catch((error: Error) => {
      this.logger.warn(`PayPal payment token failed: ${error.message}`);
      const declined = error instanceof PayPalApiError && error.status < 500;
      throw new AppError(declined ? ErrorCode.VALIDATION_ERROR : ErrorCode.PROVIDER_ERROR, declined ? 'PayPal could not save that method. Check the details and try again.' : 'PayPal did not respond. Please try again.');
    });
    await this.redis.del(setupKey(setupTokenId));
    return this.saveVaulted(userId, vaulted);
  }
}
