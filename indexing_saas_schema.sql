-- indexing_saas_schema.sql
-- Canonical DB schema for FoxIndex, per CLAUDE.md. Drafted from CLAUDE.md's
-- prose description (no source schema file existed in the repo — see
-- docs/adr/0014-pivot-to-staffed-multi-role-saas.md). Drizzle schema is
-- generated 1:1 from this file; this file is the source of truth, not the
-- other way around.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE user_role AS ENUM ('client', 'manager', 'admin', 'superadmin');
CREATE TYPE user_status AS ENUM ('pending_email', 'pending_approval', 'active', 'suspended');

CREATE TYPE credit_transaction_type AS ENUM (
  'signup_bonus', 'manual_add', 'submission_deduct', 'refund', 'payment_credit'
);

CREATE TYPE payment_method_type AS ENUM ('bkash', 'nagad', 'rocket', 'bank', 'crypto', 'card', 'gateway');
CREATE TYPE payment_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'expired');

CREATE TYPE provider_kind AS ENUM ('indexnow', 'google_indexing');
CREATE TYPE submission_status AS ENUM ('queued', 'submitted', 'indexed', 'not_indexed', 'failed', 'retrying', 'rejected');
CREATE TYPE index_check_status AS ENUM ('indexed', 'not_indexed', 'crawled_not_indexed', 'unknown');

CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'waiting_on_client', 'resolved', 'closed');

CREATE TYPE notification_channel AS ENUM ('email', 'whatsapp', 'in_app');

-- ============================================================================
-- Users, auth, audit
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  date_of_birth DATE,
  phone TEXT,              -- E.164
  whatsapp TEXT,           -- E.164
  country TEXT,
  city TEXT,
  role user_role NOT NULL DEFAULT 'client',
  status user_status NOT NULL DEFAULT 'pending_email',
  assigned_manager_id UUID REFERENCES users(id),  -- set when a client is auto-assigned a manager; null for staff
  credit_balance_cached INT NOT NULL DEFAULT 0,   -- Redis balance:<userId> is primary; this is a periodic snapshot, never written directly by app logic
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_assigned_manager_id_idx ON users(assigned_manager_id) WHERE assigned_manager_id IS NOT NULL;
CREATE INDEX users_role_status_idx ON users(role, status);

CREATE TABLE email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,             -- 6 digits
  expires_at TIMESTAMPTZ NOT NULL,  -- issued_at + 15 min
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_codes_user_id_idx ON email_verification_codes(user_id);

-- Server-side session table backing JWT refresh tokens (access tokens are
-- stateless JWTs; only refresh tokens are tracked here so they can be revoked).
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,          -- e.g. 'user.approved', 'credit.manual_add', 'payment.approved'
  target_type TEXT NOT NULL,     -- e.g. 'user', 'payment', 'ticket'
  target_id UUID,
  metadata JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_target_idx ON audit_logs(target_type, target_id);
CREATE INDEX audit_logs_actor_id_idx ON audit_logs(actor_id);

-- ============================================================================
-- Credits (ledger only — see CLAUDE.md "Credits" section)
-- ============================================================================

CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount INT NOT NULL,                        -- signed; balance = SUM(amount) WHERE user_id = ...
  type credit_transaction_type NOT NULL,
  performed_by UUID REFERENCES users(id),     -- set for manual adjustments
  reference_id UUID,                          -- submission id or payment id, depending on type
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_transactions_user_id_idx ON credit_transactions(user_id);
CREATE INDEX credit_transactions_reference_id_idx ON credit_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- ============================================================================
-- Payments (verbatim from CLAUDE.md)
-- ============================================================================

CREATE TABLE payment_methods (   -- configured by superadmin
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type payment_method_type NOT NULL, label TEXT NOT NULL,
  account_number TEXT, account_name TEXT, bank_name TEXT, branch TEXT, network TEXT, instructions TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT true, gateway TEXT, gateway_config JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true, sort_order INT DEFAULT 100
);

CREATE TABLE credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, credits INT NOT NULL,
  price_bdt NUMERIC(12,2), price_usd NUMERIC(12,2), is_active BOOLEAN DEFAULT true
);

CREATE SEQUENCE payments_reference_seq START 1000;

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,           -- PAY-1000+ via sequence
  user_id UUID NOT NULL REFERENCES users(id),
  method_id UUID NOT NULL REFERENCES payment_methods(id),
  pack_id UUID REFERENCES credit_packs(id),
  credits INT NOT NULL, amount NUMERIC(12,2) NOT NULL, currency TEXT NOT NULL,
  sender_number TEXT, transaction_id TEXT, proof_url TEXT,
  status payment_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ, reject_reason TEXT,
  gateway_payload JSONB, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX payments_trx_unique ON payments(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX payments_user_id_idx ON payments(user_id);
CREATE INDEX payments_status_idx ON payments(status);

CREATE TABLE user_payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
  type payment_method_type NOT NULL, account_number TEXT NOT NULL, label TEXT, is_default BOOLEAN DEFAULT false
);

-- ============================================================================
-- Sites (IndexNow key + Search Console OAuth)
-- ============================================================================

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  domain TEXT NOT NULL,                 -- host the IndexNow key must be served from
  indexnow_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);
CREATE INDEX sites_user_id_idx ON sites(user_id);

-- One row per site once the client completes Google OAuth for that property.
CREATE TABLE site_search_console_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
  property_url TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,   -- common/crypto (KMS/libsodium) — never log
  access_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indexing pipeline
-- ============================================================================

-- Runtime provider registry; superadmin-managed, workers load active ones
-- sorted by priority.
CREATE TABLE indexing_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind provider_kind NOT NULL,
  label TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,   -- lower = tried first
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB,                        -- e.g. api_base_url override
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pool of Google service accounts the Indexing API submit flow rotates
-- across; daily quota is tracked in Redis (INCR + midnight TTL), not here.
CREATE TABLE google_service_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  client_email TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,   -- common/crypto — never log
  gcp_project_id TEXT NOT NULL,
  daily_quota INT NOT NULL DEFAULT 200,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  user_id UUID NOT NULL REFERENCES users(id),   -- denormalized owner, avoids a join for per-user queries
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  indexed_at TIMESTAMPTZ,                       -- set on first positive index_checks row
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, normalized_url)              -- duplicate URL per site is skipped and not charged
);
CREATE INDEX urls_user_id_idx ON urls(user_id);

CREATE TABLE url_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url_id UUID NOT NULL REFERENCES urls(id),
  user_id UUID NOT NULL REFERENCES users(id),
  provider_id UUID NOT NULL REFERENCES indexing_providers(id),
  status submission_status NOT NULL DEFAULT 'queued',
  credit_cost INT NOT NULL DEFAULT 0,     -- 1 for google_indexing, 0 for indexnow
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX url_submissions_url_id_idx ON url_submissions(url_id);
CREATE INDEX url_submissions_user_id_idx ON url_submissions(user_id);
CREATE INDEX url_submissions_status_idx ON url_submissions(status);

CREATE TABLE index_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url_id UUID NOT NULL REFERENCES urls(id),
  provider_id UUID REFERENCES indexing_providers(id),
  status index_check_status NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  raw_response JSONB
);
CREATE INDEX index_checks_url_id_idx ON index_checks(url_id);

-- ============================================================================
-- Support: tickets
-- ============================================================================

CREATE SEQUENCE tickets_number_seq START 1000;

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE NOT NULL,               -- TKT-1000+
  user_id UUID NOT NULL REFERENCES users(id),        -- client who opened it
  assigned_manager_id UUID REFERENCES users(id),
  subject TEXT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'open',
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,                     -- auto-close 7 days after resolved_at
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tickets_user_id_idx ON tickets(user_id);
CREATE INDEX tickets_assigned_manager_id_idx ON tickets(assigned_manager_id);
CREATE INDEX tickets_status_idx ON tickets(status);

CREATE TABLE ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,   -- hidden from clients
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket_id_idx ON ticket_messages(ticket_id);

-- ============================================================================
-- Live chat (schema only — gateway/hooks/widget come from live-chat-module.zip)
-- ============================================================================

-- One conversation per client<->manager pair.
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id),
  manager_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, manager_id)
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conversation_id_idx ON chat_messages(conversation_id);

-- ============================================================================
-- Notifications (email / WhatsApp, deduped)
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  channel notification_channel NOT NULL,
  type TEXT NOT NULL,               -- e.g. 'submission_failed', 'chat_offline', 'ticket_reply'
  payload JSONB,
  dedupe_key TEXT,                  -- e.g. `${type}:${userId}` truncated to a 10 min bucket
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_id_idx ON notifications(user_id);
CREATE INDEX notifications_dedupe_key_idx ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ============================================================================
-- Public API
-- ============================================================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX api_keys_user_id_idx ON api_keys(user_id);
