import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paymentMethodTypeEnum, paymentStatusEnum } from './enums';
import { users } from './users';

/** Configured by superadmin — both manual (bKash/Nagad/bank/etc.) and gateway (aamarPay) methods. */
export const paymentMethods = pgTable('payment_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: paymentMethodTypeEnum('type').notNull(),
  label: text('label').notNull(),
  accountNumber: text('account_number'),
  accountName: text('account_name'),
  bankName: text('bank_name'),
  branch: text('branch'),
  network: text('network'),
  instructions: text('instructions'),
  isManual: boolean('is_manual').notNull().default(true),
  gateway: text('gateway'),
  gatewayConfig: jsonb('gateway_config'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').default(100),
  /** Surcharge added on top of the pack price, e.g. 2.5 for cards. */
  feePercent: numeric('fee_percent', { precision: 5, scale: 2 }).notNull().default('0'),
});

export const creditPacks = pgTable('credit_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  credits: integer('credits').notNull(),
  priceBdt: numeric('price_bdt', { precision: 12, scale: 2 }),
  priceUsd: numeric('price_usd', { precision: 12, scale: 2 }),
  isActive: boolean('is_active').default(true),
  isFeatured: boolean('is_featured').notNull().default(false),
});

export const paymentReferenceSeq = pgSequence('payment_reference_seq', { startWith: 2000 });

/**
 * `reference` (PAY-1000+) is assigned by the payments service from a DB
 * sequence at insert time, not a Drizzle default — see seed.ts / the
 * payments module for the sequence usage.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    methodId: uuid('method_id')
      .notNull()
      .references(() => paymentMethods.id),
    packId: uuid('pack_id').references(() => creditPacks.id),
    credits: integer('credits').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    senderNumber: text('sender_number'),
    transactionId: text('transaction_id'),
    proofUrl: text('proof_url'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    gatewayPayload: jsonb('gateway_payload'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('payments_trx_unique').on(table.transactionId).where(sql`${table.transactionId} IS NOT NULL`),
  ],
);

export const userPaymentAccounts = pgTable('user_payment_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: paymentMethodTypeEnum('type').notNull(),
  accountNumber: text('account_number').notNull(),
  label: text('label'),
  isDefault: boolean('is_default').default(false),
});
