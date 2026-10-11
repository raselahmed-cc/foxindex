import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sites } from './sites';
import { users } from './users';

/**
 * `keyHash` is sha256 of the full secret; the plaintext is shown once at
 * creation and never stored. `keyPrefix` + `keyLast4` are what the UI shows.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    keyHash: text('key_hash').notNull().unique(),
    label: text('label'),
    keyPrefix: text('key_prefix').notNull().default(''),
    keyLast4: text('key_last4').notNull().default(''),
    scopes: text('scopes').array().notNull().default([]),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    monthlyCreditCap: integer('monthly_credit_cap'),
    ipAllowlist: text('ip_allowlist').array().notNull().default([]),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('api_keys_user_id_idx').on(table.userId)],
);
