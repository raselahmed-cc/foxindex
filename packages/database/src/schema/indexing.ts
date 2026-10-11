import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { indexCheckStatusEnum, providerKindEnum, submissionStatusEnum } from './enums';
import { sites } from './sites';
import { users } from './users';

/** Runtime provider registry — superadmin-managed; workers load active ones sorted by priority. */
export const indexingProviders = pgTable('indexing_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: providerKindEnum('kind').notNull(),
  label: text('label').notNull(),
  priority: integer('priority').notNull().default(100),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Pool the Google Indexing API submit flow rotates across; daily quota lives in Redis, not here. */
export const googleServiceAccounts = pgTable('google_service_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  clientEmail: text('client_email').notNull(),
  privateKeyEncrypted: text('private_key_encrypted').notNull(),
  gcpProjectId: text('gcp_project_id').notNull(),
  dailyQuota: integer('daily_quota').notNull().default(200),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const urls = pgTable(
  'urls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('urls_site_normalized_unique').on(table.siteId, table.normalizedUrl),
    index('urls_user_id_idx').on(table.userId),
  ],
);

/**
 * One row per bulk submit (web paste/CSV/sitemap or API call). `name` is
 * user-editable; counts and credits are fixed at creation time.
 */
export const submissionBatches = pgTable(
  'submission_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    source: text('source').notNull().default('paste'),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    engines: text('engines').array().notNull().default([]),
    urlCount: integer('url_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    creditsCharged: integer('credits_charged').notNull().default(0),
    priority: boolean('priority').notNull().default(false),
    recheckUntilIndexed: boolean('recheck_until_indexed').notNull().default(true),
    notifyWhenDone: boolean('notify_when_done').notNull().default(true),
    /** Set when created through the public API — monthly key caps are summed from this. */
    apiKeyId: uuid('api_key_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('submission_batches_user_created_idx').on(table.userId, table.createdAt),
    index('submission_batches_api_key_idx').on(table.apiKeyId, table.createdAt),
  ],
);

export const urlSubmissions = pgTable(
  'url_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    urlId: uuid('url_id')
      .notNull()
      .references(() => urls.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => indexingProviders.id),
    batchId: uuid('batch_id').references(() => submissionBatches.id),
    status: submissionStatusEnum('status').notNull().default('queued'),
    creditCost: integer('credit_cost').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('url_submissions_url_id_idx').on(table.urlId),
    index('url_submissions_user_id_idx').on(table.userId),
    index('url_submissions_status_idx').on(table.status),
    index('url_submissions_batch_id_idx').on(table.batchId),
  ],
);

export const indexChecks = pgTable(
  'index_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    urlId: uuid('url_id')
      .notNull()
      .references(() => urls.id),
    providerId: uuid('provider_id').references(() => indexingProviders.id),
    status: indexCheckStatusEnum('status').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rawResponse: jsonb('raw_response'),
  },
  (table) => [index('index_checks_url_id_idx').on(table.urlId)],
);
