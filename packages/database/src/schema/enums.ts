import { pgEnum } from 'drizzle-orm/pg-core';

// Mirrors indexing_saas_schema.sql exactly — see docs/adr/0014.
export const userRoleEnum = pgEnum('user_role', ['client', 'manager', 'admin', 'superadmin']);
export const userStatusEnum = pgEnum('user_status', ['pending_email', 'pending_approval', 'active', 'suspended']);

export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'signup_bonus',
  'manual_add',
  'submission_deduct',
  'refund',
  'payment_credit',
  'manual_deduct',
]);

export const paymentMethodTypeEnum = pgEnum('payment_method_type', [
  'bkash',
  'nagad',
  'rocket',
  'bank',
  'crypto',
  'card',
  'gateway',
  'paypal',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'under_review',
  'approved',
  'rejected',
  'expired',
]);

export const providerKindEnum = pgEnum('provider_kind', [
  'indexnow',
  'google_indexing',
  'external_api',
  'search_console_sitemap',
]);
export const submissionStatusEnum = pgEnum('submission_status', [
  'queued',
  'submitted',
  'indexed',
  'not_indexed',
  'failed',
  'retrying',
  'rejected',
]);
export const indexCheckStatusEnum = pgEnum('index_check_status', [
  'indexed',
  'not_indexed',
  'crawled_not_indexed',
  'unknown',
]);

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'in_progress',
  'waiting_on_client',
  'resolved',
  'closed',
]);

export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'whatsapp', 'in_app']);
