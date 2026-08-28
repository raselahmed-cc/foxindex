import { z } from 'zod';
import { normalizeHostname } from '../url-normalization';

export const createDomainSchema = z.object({
  hostname: z
    .string()
    .min(1)
    .max(255)
    .transform((value, ctx) => {
      try {
        return normalizeHostname(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid hostname' });
        return z.NEVER;
      }
    }),
});
export type CreateDomainInput = z.infer<typeof createDomainSchema>;

export const verifyDomainQuerySchema = z.object({
  recheck: z.coerce.boolean().optional().default(false),
});
export type VerifyDomainQuery = z.infer<typeof verifyDomainQuerySchema>;
