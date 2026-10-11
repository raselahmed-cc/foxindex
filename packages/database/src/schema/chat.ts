import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/** Schema only — gateway/hooks/widget come from live-chat-module.zip (see CLAUDE.md). One conversation per client<->manager pair. */
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => users.id),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => users.id),
    /** Staff-only note about the client; never sent to the client. */
    internalNote: text('internal_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('chat_conversations_client_manager_unique').on(table.clientId, table.managerId)],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Optional extras: quickReplies, answeredReply, ticketNumber (system messages). */
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chat_messages_conversation_id_idx').on(table.conversationId)],
);
