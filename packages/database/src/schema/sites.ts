import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    domain: text('domain').notNull(),
    indexnowKey: text('indexnow_key').notNull(),
    /** Set when https://<domain>/<key>.txt was found with the right key — IndexNow engines ignore URLs from unverified sites. */
    indexnowVerifiedAt: timestamp('indexnow_verified_at', { withTimezone: true }),
    indexnowCheckedAt: timestamp('indexnow_checked_at', { withTimezone: true }),
    /** Why the last check failed, in words the client can act on. */
    indexnowLastError: text('indexnow_last_error'),
    /** Search Console property that worked for index checks, e.g. "sc-domain:example.com". */
    gscProperty: text('gsc_property'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('sites_user_domain_unique').on(table.userId, table.domain)],
);

/** One row per site once the client completes Google OAuth for that property. */
export const siteSearchConsoleConnections = pgTable('site_search_console_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id')
    .notNull()
    .unique()
    .references(() => sites.id, { onDelete: 'cascade' }),
  propertyUrl: text('property_url').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  accessTokenEncrypted: text('access_token_encrypted'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
});
