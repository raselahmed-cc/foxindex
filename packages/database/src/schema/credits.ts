import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creditTransactionTypeEnum } from './enums';
import { users } from './users';

/**
 * Append-only. Balance = SUM(amount) WHERE user_id = ... — never a column
 * that gets edited directly (see CLAUDE.md "Credits"). Cached in Redis
 * `balance:<userId>`, invalidated on every insert.
 */
export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    amount: integer('amount').notNull(),
    type: creditTransactionTypeEnum('type').notNull(),
    performedBy: uuid('performed_by').references(() => users.id),
    referenceId: uuid('reference_id'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_transactions_user_id_idx').on(table.userId),
    index('credit_transactions_reference_id_idx').on(table.referenceId),
  ],
);
