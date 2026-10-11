import { z } from 'zod';

export const PROVIDER_KINDS = ['google_indexing', 'indexnow', 'external_api', 'search_console_sitemap'] as const;

export const upsertProviderSchema = z.object({
  kind: z.enum(PROVIDER_KINDS),
  label: z.string().trim().min(1).max(80),
  priority: z.number().int().min(0).max(10_000),
  isActive: z.boolean().default(true),
  description: z.string().trim().max(200).optional(),
  submitEndpoint: z.url().optional(),
  statusEndpoint: z.string().trim().max(500).optional(),
  /** Write-only: omitted on update keeps the stored (encrypted) key. */
  apiKey: z.string().min(1).max(500).optional(),
  dailyQuota: z.number().int().positive().nullable().optional(),
  costUsd: z.number().min(0).max(10).default(0),
  creditCost: z.number().int().min(0).max(100).default(1),
  requestTemplate: z.string().max(4000).optional(),
  retriesOnly: z.boolean().default(true),
  autoPauseAfterErrors: z.boolean().default(true),
});
export type UpsertProviderInput = z.infer<typeof upsertProviderSchema>;

export const reorderProvidersSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) });
export type ReorderProvidersInput = z.infer<typeof reorderProvidersSchema>;

export const createServiceAccountSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  /** The raw JSON key file downloaded from Google Cloud. */
  keyJson: z.string().min(20).max(10_000),
  dailyQuota: z.number().int().positive().max(100_000).default(200),
});
export type CreateServiceAccountInput = z.infer<typeof createServiceAccountSchema>;

export const updateServiceAccountSchema = z.object({
  isActive: z.boolean().optional(),
  dailyQuota: z.number().int().positive().max(100_000).optional(),
});
export type UpdateServiceAccountInput = z.infer<typeof updateServiceAccountSchema>;

export const STAFF_ROLES = ['manager', 'admin', 'superadmin'] as const;

export const inviteStaffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((v) => v.toLowerCase()),
  role: z.enum(STAFF_ROLES),
  maxClients: z.number().int().positive().max(10_000).nullable().optional(),
});
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const updateStaffSchema = z.object({
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  maxClients: z.number().int().positive().max(10_000).nullable().optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime().optional(),
  action: z.string().trim().max(60).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const userListQuerySchema = z.object({
  status: z.enum(['pending_email', 'pending_approval', 'active', 'suspended']).optional(),
  role: z.enum(['client', 'manager', 'admin', 'superadmin']).optional(),
  q: z.string().trim().max(120).optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const setUserStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;
