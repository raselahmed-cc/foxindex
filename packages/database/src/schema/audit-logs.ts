import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { apiKeys } from './api-keys';
import { organizations } from './organizations';

/**
 * Write-path only in Phase 1 (constitution §40): AuditLogService.record() is
 * called from other services' write paths (organization.created,
 * domain.verified, url.submitted, api_key.created/revoked). No read API/UI yet
 * — building one now with no consumer would itself be dead code.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => user.id),
    actorApiKeyId: uuid('actor_api_key_id').references(() => apiKeys.id),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: uuid('resource_id'),
    metadata: jsonb('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_organization_id_created_at_idx').on(table.organizationId, table.createdAt),
    index('audit_logs_resource_type_resource_id_idx').on(table.resourceType, table.resourceId),
  ],
);
