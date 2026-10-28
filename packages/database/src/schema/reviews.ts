import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Customer reviews. One per client (editing sends it back for approval). Only
 * reviews a client agreed to publish and staff approved are ever shown publicly.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    body: text('body').notNull(),
    /** Name as the client wants it shown, e.g. "Tanvir H." */
    displayName: text('display_name').notNull(),
    company: text('company'),
    jobTitle: text('job_title'),
    /** pending | approved | rejected */
    status: text('status').notNull().default('pending'),
    featured: boolean('featured').notNull().default(false),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('reviews_status_idx').on(table.status, table.featured, table.updatedAt)],
);
