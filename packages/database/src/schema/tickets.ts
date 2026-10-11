import { boolean, index, integer, jsonb, pgSequence, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ticketStatusEnum } from './enums';
import { sites } from './sites';
import { users } from './users';

export const ticketNumberSeq = pgSequence('ticket_number_seq', { startWith: 1000 });

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    assignedManagerId: uuid('assigned_manager_id').references(() => users.id),
    subject: text('subject').notNull(),
    /** billing | indexing | account | other */
    category: text('category').notNull().default('other'),
    /** low | normal | high | urgent */
    priority: text('priority').notNull().default('normal'),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    /** Set when the ticket was created from a live-chat conversation. */
    conversationId: uuid('conversation_id'),
    status: ticketStatusEnum('status').notNull().default('open'),
    /** web | chat | staff | api — how the ticket was opened. */
    source: text('source').notNull().default('web'),
    tags: text('tags').array().notNull().default([]),
    /** SLA targets, computed from the priority's policy (business hours aware) at creation / priority change. */
    firstResponseDueAt: timestamp('first_response_due_at', { withTimezone: true }),
    resolutionDueAt: timestamp('resolution_due_at', { withTimezone: true }),
    /** Resolution clock is paused while waiting on the client or resolved; due date shifts on resume. */
    slaPausedAt: timestamp('sla_paused_at', { withTimezone: true }),
    /** SLA minutes (counted the way the policy counts) spent paused so far; added onto the resolution target. */
    slaPausedMinutes: integer('sla_paused_minutes').notNull().default(0),
    firstResponseWarnedAt: timestamp('first_response_warned_at', { withTimezone: true }),
    firstResponseBreachedAt: timestamp('first_response_breached_at', { withTimezone: true }),
    resolutionWarnedAt: timestamp('resolution_warned_at', { withTimezone: true }),
    resolutionBreachedAt: timestamp('resolution_breached_at', { withTimezone: true }),
    /** Last "still need help?" nudge sent while waiting on the client. */
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    csatRating: smallint('csat_rating'),
    csatComment: text('csat_comment'),
    csatAt: timestamp('csat_at', { withTimezone: true }),
    mergedIntoId: uuid('merged_into_id'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    /** Who sent the latest visible message — drives the unread dot for the other side. */
    lastSenderId: uuid('last_sender_id'),
    clientReadAt: timestamp('client_read_at', { withTimezone: true }),
    staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tickets_user_id_idx').on(table.userId),
    index('tickets_assigned_manager_id_idx').on(table.assignedManagerId),
    index('tickets_status_idx').on(table.status),
    index('tickets_last_message_idx').on(table.lastMessageAt),
    index('tickets_resolution_due_idx').on(table.resolutionDueAt),
    index('tickets_tags_idx').using('gin', table.tags),
  ],
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    /** Null for automation events (SLA breach, auto-close…). */
    senderId: uuid('sender_id').references(() => users.id),
    body: text('body').notNull(),
    isInternalNote: boolean('is_internal_note').notNull().default(false),
    /** message | event — events are system lines like "status changed" or "credits added". */
    kind: text('kind').notNull().default('message'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ticket_messages_ticket_id_idx').on(table.ticketId)],
);

/**
 * Canned replies with optional actions. ownerId null = shared with all staff
 * (admins manage those); otherwise personal to that agent.
 */
export const ticketMacros = pgTable(
  'ticket_macros',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** { status?, priority?, addTags? } applied when the macro's reply is sent. */
    actions: jsonb('actions').notNull().default({}),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    usageCount: integer('usage_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ticket_macros_owner_idx').on(table.ownerId)],
);

/** Small key/value store for platform configuration edited from the panel (e.g. support SLA policy). */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
