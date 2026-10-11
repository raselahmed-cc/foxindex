import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Files uploaded to chat messages and ticket replies. Uploaded first
 * (unattached), then linked when the message is sent; unlinked uploads older
 * than a day are safe to purge. Bytes live in object storage under storageKey.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id),
    /** chat_message | ticket_message — null until linked. */
    ownerType: text('owner_type'),
    ownerId: uuid('owner_id'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('attachments_owner_idx').on(table.ownerType, table.ownerId), index('attachments_uploader_idx').on(table.uploaderId)],
);
