import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creditLedgerReasonEnum } from './enums';
import { organizations } from './organizations';

/**
 * Append-only, same style as domain_verifications/submission_attempts —
 * organizations.credit_balance is the fast-path cache, this is the audit
 * trail it's derived from. See docs/adr/0011 for why this exists but isn't
 * "billing" (no plans/subscriptions/Stripe — those stay in future-schema.md).
 */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Positive for grants (signup bonus, manual grant), negative for deductions. */
    delta: integer('delta').notNull(),
    reason: creditLedgerReasonEnum('reason').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('credit_ledger_organization_id_created_at_idx').on(table.organizationId, table.createdAt)],
);
