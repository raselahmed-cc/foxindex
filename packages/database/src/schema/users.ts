import { date, index, integer, jsonb, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { userRoleEnum, userStatusEnum } from './enums';

/**
 * Replaces Better Auth's `user` table (docs/adr/0014 — custom JWT/argon2 auth).
 * `assignedManagerId` is set by the auto-assign-on-verify step (the manager
 * with the fewest active clients); null for staff (manager/admin/superadmin).
 * `creditBalanceCached` is a periodic snapshot only — Redis `balance:<userId>`
 * is primary, credit_transactions is the source of truth (see credits.ts).
 * `whatsapp` defaults to `phone` at signup (service-layer default, not a DB
 * constraint) and is editable separately afterward from the profile page.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    dateOfBirth: date('date_of_birth'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    telegram: text('telegram'),
    country: text('country'),
    city: text('city'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    company: text('company'),
    timezone: text('timezone'),
    /** Notification channels, submission defaults, low-balance threshold — validated by userPreferencesSchema. */
    preferences: jsonb('preferences'),
    /** Managers only: auto-assign skips a manager at or above this many clients. */
    maxClients: integer('max_clients'),
    /** Staff chat availability: available | away. */
    availability: text('availability').notNull().default('available'),
    role: userRoleEnum('role').notNull().default('client'),
    status: userStatusEnum('status').notNull().default('pending_email'),
    assignedManagerId: uuid('assigned_manager_id').references((): AnyPgColumn => users.id),
    creditBalanceCached: integer('credit_balance_cached').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('users_assigned_manager_id_idx').on(table.assignedManagerId),
    index('users_role_status_idx').on(table.role, table.status),
  ],
);

export const emailVerificationCodes = pgTable(
  'email_verification_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('email_verification_codes_user_id_idx').on(table.userId)],
);

/** Backs JWT refresh tokens — access tokens are stateless and not persisted. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);
