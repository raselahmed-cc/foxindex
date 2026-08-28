import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { SubmissionProvider, UrlSubmissionState } from '@foxindex/types';
import { user } from './auth';
import { apiKeys } from './api-keys';
import { submissionFailureReasonEnum, submissionProviderEnum, urlSubmissionStateEnum } from './enums';
import { organizations } from './organizations';
import { projects } from './projects';
import { urls } from './urls';

/**
 * One row per submission request per URL. `state` follows the centralized
 * lifecycle in @foxindex/types (constitution §37) — Phase 1's only registered
 * provider (IndexNow) never produces INDEXED/NOT_INDEXED, so in practice this
 * terminates at SUBMITTED or FAILED until a status-checking provider exists.
 */
export const urlSubmissions = pgTable(
  'url_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    urlId: uuid('url_id')
      .notNull()
      .references(() => urls.id, { onDelete: 'cascade' }),
    provider: submissionProviderEnum('provider').notNull().default(SubmissionProvider.INDEXNOW),
    state: urlSubmissionStateEnum('state').notNull().default(UrlSubmissionState.RECEIVED),
    failureReason: submissionFailureReasonEnum('failure_reason'),
    failureDetail: varchar('failure_detail', { length: 1000 }),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    requestedByUserId: text('requested_by_user_id').references(() => user.id),
    requestedByApiKeyId: uuid('requested_by_api_key_id').references(() => apiKeys.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Defense-in-depth only — the primary idempotency mechanism is the
    // Redis NX-locked cache in apps/api (packages/queue); this partial unique
    // index just makes a duplicate impossible to persist even if that cache
    // were ever bypassed.
    uniqueIndex('url_submissions_org_idempotency_key_unique')
      .on(table.organizationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('url_submissions_url_id_idx').on(table.urlId),
    index('url_submissions_project_id_state_idx').on(table.projectId, table.state),
    index('url_submissions_state_idx').on(table.state),
  ],
);

/** Append-only per-attempt log — the durable record BullMQ's retries write to. */
export const submissionAttempts = pgTable(
  'submission_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    urlSubmissionId: uuid('url_submission_id')
      .notNull()
      .references(() => urlSubmissions.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    provider: submissionProviderEnum('provider').notNull(),
    requestPayload: jsonb('request_payload'),
    responseStatusCode: integer('response_status_code'),
    responseBody: jsonb('response_body'),
    succeeded: boolean('succeeded').notNull(),
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: varchar('error_message', { length: 1000 }),
    durationMs: integer('duration_ms'),
    jobId: varchar('job_id', { length: 255 }),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('submission_attempts_url_submission_id_attempt_number_idx').on(
      table.urlSubmissionId,
      table.attemptNumber,
    ),
  ],
);
