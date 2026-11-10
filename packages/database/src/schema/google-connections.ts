import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * A customer's "Connect Google Search Console" authorization. Their own sign-in lets
 * FoxIndex submit (Indexing API) and inspect (URL Inspection) URLs on properties they
 * own — no need to add our service account as an Owner. The refresh token is
 * encrypted at rest; `properties` is the last list Search Console returned.
 */
export const googleConnections = pgTable(
  'google_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    googleEmail: text('google_email').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    /** [{ siteUrl, permissionLevel }] from the Search Console sites list. */
    properties: jsonb('properties').notNull().default([]),
    /** active | revoked (Google says the access was removed) */
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    propertiesRefreshedAt: timestamp('properties_refreshed_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('google_connections_user_email_unique').on(table.userId, table.googleEmail), index('google_connections_user_idx').on(table.userId)],
);
