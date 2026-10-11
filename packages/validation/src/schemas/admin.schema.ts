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
