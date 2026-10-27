import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Pre-sales chat from the public website — visitors are not accounts. The
 * visitor proves ownership of a chat with a random token (only its SHA-256
 * is stored); any manager or admin can pick the chat up.
 */
export const visitorChats = pgTable(
  'visitor_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    tokenHash: text('token_hash').notNull().unique(),
    /** open | closed */
    status: text('status').notNull().default('open'),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    /** Page the visitor started from, e.g. "/#pricing". */
    page: text('page'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    /** visitor | staff — drives the unread badge for staff. */
    lastSender: text('last_sender').notNull().default('visitor'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('visitor_chats_status_last_idx').on(table.status, table.lastMessageAt)],
);

export const visitorChatMessages = pgTable(
  'visitor_chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => visitorChats.id, { onDelete: 'cascade' }),
    /** visitor | staff | system */
    senderType: text('sender_type').notNull(),
    staffId: uuid('staff_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('visitor_chat_messages_chat_idx').on(table.chatId, table.createdAt)],
);
