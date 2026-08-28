import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { DomainVerificationStatus } from '@foxindex/types';
import { user } from './auth';
import { domainVerificationMethodEnum, domainVerificationStatusEnum } from './enums';
import { organizations } from './organizations';
import { projects } from './projects';

/**
 * indexnowKey is server-generated (32-char hex) when a domain is created, and
 * doubles as both the IndexNow submission credential AND the value the
 * verification worker expects to find hosted at the domain's key-file URL —
 * verifying ownership and authorizing future submissions are the same act.
 */
export const domains = pgTable(
  'domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    hostname: varchar('hostname', { length: 255 }).notNull(),
    indexnowKey: varchar('indexnow_key', { length: 128 }).notNull(),
    indexnowKeyLocation: varchar('indexnow_key_location', { length: 2048 }),
    verificationStatus: domainVerificationStatusEnum('verification_status')
      .notNull()
      .default(DomainVerificationStatus.PENDING),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('domains_project_hostname_unique').on(table.projectId, table.hostname),
    uniqueIndex('domains_indexnow_key_unique').on(table.indexnowKey),
    index('domains_organization_id_idx').on(table.organizationId),
    index('domains_verification_status_idx').on(table.verificationStatus),
  ],
);

/** Append-only attempt log — never updated in place, so verification history is auditable. */
export const domainVerifications = pgTable(
  'domain_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    method: domainVerificationMethodEnum('method').notNull(),
    status: domainVerificationStatusEnum('status').notNull(),
    checkedUrl: varchar('checked_url', { length: 2048 }).notNull(),
    httpStatusCode: integer('http_status_code'),
    failureReason: varchar('failure_reason', { length: 255 }),
    responseSnippet: varchar('response_snippet', { length: 500 }),
    jobId: varchar('job_id', { length: 255 }),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('domain_verifications_domain_id_attempted_at_idx').on(table.domainId, table.attemptedAt)],
);
