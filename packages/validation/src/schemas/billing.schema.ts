import { z } from 'zod';

/** Either a pack or a custom credit amount — the server prices it, never the client. */
export const createPaymentSchema = z
  .object({
    methodId: z.uuid(),
    packId: z.uuid().optional(),
    credits: z.number().int().min(100).max(1_000_000).optional(),
    currency: z.enum(['BDT', 'USD']).default('BDT'),
    transactionId: z.string().trim().min(4).max(64).optional(),
    senderNumber: z.string().trim().max(32).optional(),
  })
  .refine((v) => Boolean(v.packId) !== Boolean(v.credits), {
    message: 'Provide exactly one of packId or credits',
    path: ['packId'],
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const quotePaymentSchema = z
  .object({
    methodId: z.uuid().optional(),
    packId: z.uuid().optional(),
    credits: z.coerce.number().int().min(100).max(1_000_000).optional(),
    currency: z.enum(['BDT', 'USD']).default('BDT'),
  })
  .refine((v) => Boolean(v.packId) !== Boolean(v.credits), { message: 'Provide exactly one of packId or credits' });
export type QuotePaymentInput = z.infer<typeof quotePaymentSchema>;

export const rejectPaymentSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

export const paymentListQuerySchema = z.object({
  status: z.enum(['pending', 'under_review', 'approved', 'rejected', 'expired']).optional(),
});

export const upsertCreditPackSchema = z.object({
  name: z.string().trim().min(1).max(60),
  credits: z.number().int().positive().max(10_000_000),
  priceBdt: z.number().nonnegative().max(100_000_000),
  priceUsd: z.number().nonnegative().max(1_000_000),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});
export type UpsertCreditPackInput = z.infer<typeof upsertCreditPackSchema>;

export const PAYMENT_METHOD_TYPES = ['bkash', 'nagad', 'rocket', 'bank', 'crypto', 'card', 'gateway'] as const;

export const upsertPaymentMethodSchema = z.object({
  type: z.enum(PAYMENT_METHOD_TYPES),
  label: z.string().trim().min(1).max(80),
  accountNumber: z.string().trim().max(80).nullable().optional(),
  accountName: z.string().trim().max(120).nullable().optional(),
  bankName: z.string().trim().max(120).nullable().optional(),
  branch: z.string().trim().max(120).nullable().optional(),
  network: z.string().trim().max(40).nullable().optional(),
  instructions: z.string().trim().max(500).nullable().optional(),
  isManual: z.boolean(),
  gateway: z.enum(['aamarpay']).nullable().optional(),
  feePercent: z.number().min(0).max(20).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
});
export type UpsertPaymentMethodInput = z.infer<typeof upsertPaymentMethodSchema>;
