import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { roleEnum } from './enums';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    // Fast-path cache derived from credit_ledger (docs/adr/0011) — every
    // change to this column happens alongside a ledger row in the same
    // transaction, never on its own.
    creditBalance: integer('credit_balance').notNull().default(0),
    createdByUserId: text('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
);

/**
 * Phase 1's only membership path is org-creation: the creator is inserted here as
 * OWNER in the same transaction (constitution's role enum has no generic default —
 * every membership row sets its role explicitly). An invite flow is Phase 2.
 */
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    invitedByUserId: text('invited_by_user_id').references(() => user.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_members_org_user_unique').on(table.organizationId, table.userId),
    index('organization_members_user_id_idx').on(table.userId),
  ],
);
