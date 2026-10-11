import { z } from 'zod';

export const API_KEY_SCOPES = ['submit', 'status', 'sites'] as const;
export type ApiKeyScopeName = (typeof API_KEY_SCOPES)[number];

const ipOrCidr = z
  .string()
  .trim()
  .regex(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-fA-F:]+(\/\d{1,3})?$/, 'Must be an IPv4/IPv6 address or CIDR range');

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  siteId: z.uuid().nullable().optional(),
  monthlyCreditCap: z.number().int().positive().max(10_000_000).nullable().optional(),
  ipAllowlist: z.array(ipOrCidr).max(50).default([]),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = createApiKeySchema.partial();
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
