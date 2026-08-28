import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { ApiKeyScope } from '@foxindex/types';
import { user } from './auth';
import { apiKeyScopeEnum } from './enums';
import { organizations } from './organizations';
import { projects } from './projects';

/**
 * Only keyPrefix + sha256(keyHash) are stored — the plaintext secret is shown
 * once at creation and never persisted (constitution §20). `projectId` is
 * nullable: an org-wide key can submit into any project the caller can resolve.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
    keyHash: varchar('key_hash', { length: 255 }).notNull(),
    scopes: apiKeyScopeEnum('scopes')
      .array()
      .notNull()
      .default([ApiKeyScope.SUBMIT_URLS]),
    createdByUserId: text('created_by_user_id').references(() => user.id),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('api_keys_key_prefix_unique').on(table.keyPrefix),
    index('api_keys_organization_id_idx').on(table.organizationId),
    index('api_keys_key_hash_idx').on(table.keyHash),
  ],
);
