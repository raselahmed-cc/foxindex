import { z } from 'zod';

export const grantCreditsSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
  note: z.string().trim().max(500).optional(),
});
export type GrantCreditsInput = z.infer<typeof grantCreditsSchema>;

export const assignManagerSchema = z.object({
  managerId: z.uuid(),
});
export type AssignManagerInput = z.infer<typeof assignManagerSchema>;

export const adjustCreditsSchema = z.object({
  direction: z.enum(['add', 'deduct']),
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().trim().min(3, 'Add a short reason — it is shown in the ledger').max(500),
});
export type AdjustCreditsInput = z.infer<typeof adjustCreditsSchema>;

/** Platform credit policy — superadmin edits it; managers and admins work within it. */
export const creditSettingsSchema = z.object({
  /** Charged for every URL accepted into a batch (all engines included). */
  creditsPerUrl: z.number().int().min(0).max(100),
  /** Largest single add/deduct an account manager may make. */
  managerMaxPerAdjustment: z.number().int().min(0).max(1_000_000),
  /** Total an account manager may add or remove per day, across all clients. */
  managerDailyLimit: z.number().int().min(0).max(10_000_000),
  managersCanDeduct: z.boolean(),
  /** Largest single add/deduct an admin may make (superadmin has no limit). */
  adminMaxPerAdjustment: z.number().int().min(0).max(10_000_000),
});
export type CreditSettings = z.infer<typeof creditSettingsSchema>;

export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  creditsPerUrl: 1,
  managerMaxPerAdjustment: 5_000,
  managerDailyLimit: 20_000,
  managersCanDeduct: false,
  adminMaxPerAdjustment: 100_000,
};

export const CREDIT_TRANSACTION_TYPES = ['signup_bonus', 'manual_add', 'manual_deduct', 'submission_deduct', 'refund', 'payment_credit'] as const;

export const creditLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime().optional(),
  type: z.enum(CREDIT_TRANSACTION_TYPES).optional(),
  userId: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
});
export type CreditLedgerQuery = z.infer<typeof creditLedgerQuerySchema>;
