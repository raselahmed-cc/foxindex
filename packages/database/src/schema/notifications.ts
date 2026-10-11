import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { notificationChannelEnum } from './enums';
import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    channel: notificationChannelEnum('channel').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload'),
    dedupeKey: text('dedupe_key'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_id_idx').on(table.userId),
    index('notifications_dedupe_key_idx').on(table.dedupeKey).where(sql`${table.dedupeKey} IS NOT NULL`),
  ],
);
