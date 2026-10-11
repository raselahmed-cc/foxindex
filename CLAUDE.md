# CLAUDE.md — FoxIndex (instant indexing SaaS)

You are working on an existing codebase. Read this file fully before touching anything. Where the current code
contradicts this file, this file wins — refactor toward it, don't fork a second pattern.

## What we are building

A SaaS where clients submit URLs and we push them to Google (Indexing API + Search Console), Bing/Yandex/Naver/Seznam/Yep
(IndexNow), and optional external indexing APIs, then re-check each URL until it is confirmed indexed. Clients pay with
credits (1 credit = 1 URL to Google; IndexNow engines are free). Every account is approved by a human manager.

"FoxIndex" is a placeholder name. Keep it in a single constant (`APP_NAME`) so it can be renamed once.

## Stack (locked — do not substitute)

- Frontend: Next.js (App Router, TypeScript)
- Backend: NestJS (TypeScript)
- Database: PostgreSQL on Neon — pooled connection string for the app, direct string for migrations
- ORM: Drizzle (`drizzle-orm` + `@neondatabase/serverless`). Schema source of truth is `indexing_saas_schema.sql`; keep Drizzle schema 1:1 with it
- Cache/queues/realtime: Redis — BullMQ, rate limiting, presence, unread counts, Socket.io adapter
- Auth: JWT access + refresh, argon2 password hashing, server-side sessions table
- Email: Resend (transactional templates)
- WhatsApp: deep links now (`wa.me`), Meta Cloud API later behind a `WhatsAppService` interface
- Payments: aamarPay (client self-serve, covers bKash/Nagad/Rocket/cards); manual credit by managers
- Live chat: in-house Socket.io gateway (see `live-chat-module.zip`) — NOT Chatwoot/Crisp/Tawk
- Storage for attachments/proofs: S3-compatible (R2)

## Files already delivered — use them, don't reinvent

| File | Use |
|---|---|
| `indexing_saas_schema.sql` | Canonical DB schema. Generate Drizzle schema from it. Add the payments tables below. |
| `foxindex-designs.html` | Design system + 12 screens. Lift CSS variables into Tailwind config; reproduce layouts and copy exactly. |
| `desktop-*.png` | Visual target for each screen. |
| `live-chat-module.zip` | Gateway, service, presence, offline notifier, `useChat`/`useInbox` hooks, `ChatWidget`. Integrate as-is. |

## Roles (4) — enforce in one place

`client` < `manager` < `admin` < `superadmin`

| Action | client | manager | admin | superadmin |
|---|---|---|---|---|
| Submit URLs, see own data, open tickets/chat, buy credits | ✓ | | ✓ | ✓ |
| Approve / view / chat with **assigned** clients | | ✓ | ✓ | ✓ |
| Add credit manually to assigned clients, review their payments | | ✓ | ✓ | ✓ |
| Add credit to any user, assign managers, see all tickets/payments | | | ✓ | ✓ |
| Manage indexing providers, payment methods, gateway keys, staff roles | | | | ✓ |

Implement with `@Roles()` + `RolesGuard` and an `OwnsClientGuard` that checks `target.assigned_manager_id === actor.id`
unless actor is admin/superadmin. Never scatter `if (role === ...)` in services. Managers must never be able to query
users outside their assignment, including via list/search endpoints.

## Account lifecycle

`pending_email` → (6-digit code, 15 min expiry) → `pending_approval` → (manager approves, may add starting credit,
default 100) → `active`. Also `suspended`. On email verification: auto-assign the manager with the fewest active
clients and notify them (email + WhatsApp). Every transition writes `audit_logs`.

Signup fields (per the actual signup page design): full name, date of birth, email,
phone/WhatsApp number (country-code select + national number; WhatsApp defaults to this
number, editable separately later in profile), country, city, password (with a strength meter;
only the hash is ever sent/stored), and a required Terms of Service / Privacy Policy consent
checkbox. Telegram is NOT collected at signup — it's a profile-only field, added later. Signup
is a 3-step flow: Your details → Verify email (6-digit code) → Manager approval. Validate phone
as E.164.

After login, a user manages their own profile (name, phone, whatsapp, telegram, city, country,
avatar, bio) and can add/edit their own `user_payment_accounts` rows — self-service, no
manager/admin action needed for either.

## Credits — ledger only

- Balance is never a column that gets edited. `credit_transactions` is the ledger; balance = `SUM(amount)`.
- Cache balance in Redis `balance:<userId>`; invalidate on every insert.
- Every insert has `performed_by` (manual) or `reference_id` (submission id / payment id).
- Deduct credits inside the same DB transaction that creates the submission. Refund automatically (+1, type `refund`)
  when Google rejects a URL (4xx) or after final retry failure.

### Payments (add these tables to the schema)

```sql
CREATE TYPE payment_method_type AS ENUM ('bkash','nagad','rocket','bank','crypto','card','gateway');
CREATE TYPE payment_status AS ENUM ('pending','under_review','approved','rejected','expired');

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
CREATE TABLE user_payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
  type payment_method_type NOT NULL, account_number TEXT NOT NULL, label TEXT, is_default BOOLEAN DEFAULT false
);
```

Two paths, one ledger:
1. **Manual**: client picks pack + manual method → sees our account number → pays → submits TrxID/screenshot →
   `under_review` → manager approves → `credit_transactions` insert with `reference_id = payment.id`, same DB txn.
   Managers can also add credit directly with a note, no payment row required.
2. **aamarPay**: client picks pack → we create an aamarPay session → redirect → on IPN/callback verify the signature and
   amount, store raw payload in `gateway_payload`, mark `approved`, insert ledger row. Idempotent on `transaction_id`.
   Never trust the success redirect alone; only the server-side verification call credits the account.

## Indexing pipeline

- `indexing_providers` drives a pluggable adapter registry: each provider class implements
  `submit(urls): Promise<Result[]>` and `checkStatus(url)`. Superadmin adds providers from the panel; workers load
  active ones sorted by `priority`.
- Google Indexing API: rotate across `google_service_accounts`; daily quota counters in Redis (`INCR` + midnight TTL);
  skip accounts at quota.
- IndexNow: one POST per host, batch up to 10,000 URLs, key file `/<key>.txt` on client's domain.
- Queues (BullMQ): `index:submit`, `index:check` (6h → 24h → 72h schedule), `index:retry` (max 3, next provider),
  `notify:send`. HTTP handlers never call third-party APIs directly; they enqueue.
- Verification: Search Console URL Inspection API (2,000/day/property) → fallback fetch check. Write every check to
  `index_checks`; set `urls.indexed_at` on first positive.
- Duplicate URL per site is skipped and not charged.

## Support

- Tickets: `tickets` + `ticket_messages`, number `TKT-1000+`, `is_internal_note` hidden from clients, statuses
  open → in_progress → waiting_on_client → resolved → closed (auto-close 7 days after resolved). Manager reply sets
  `first_response_at` if null. Managers see only assigned clients' tickets.
- Live chat: integrate `live-chat-module.zip`. One conversation per client with their manager. Offline recipient →
  email + WhatsApp via `notify` queue (deduped 10 min). "Turn into ticket" copies the thread.
- WhatsApp button everywhere a manager is shown: `wa.me/<manager>?text=<prefilled with account id>`.

## Frontend rules

- Route groups: `(public)` landing/auth, `(dashboard)` client, `(staff)` manager/admin/superadmin. Each layout reads
  the role from the session and redirects. Staff nav shows superadmin items only for superadmin.
- Design tokens from `foxindex-designs.html` `:root` → `tailwind.config` (`bg`, `surface`, `line`, `text*`, `accent`,
  `ok`, `warn`, `bad`). Font: IBM Plex Sans; IBM Plex Mono only for URLs, phone numbers, ticket/payment references.
- Status pills: ok = indexed/active/approved, info = submitted/in progress, warn = queued/pending, bad = failed/suspended.
- Copy: sentence case, plain verbs, buttons say what happens ("Approve and add 100 credits", "Submit 5 URLs").
  No ALL-CAPS labels, no decorative gradients, no per-card hover animations.
- Mobile: sidebar collapses to pill tabs; every table gets horizontal scroll, never hidden columns.
- Data fetching: server components for reads, React Query mutations against the Nest API. No `localStorage` for auth.

## Backend conventions

- Module per domain: `auth, users, credits, payments, providers, sites, indexing, workers, tickets, chat, notifications,
  audit, common`. Facts about one entity live in that entity's module.
- DTOs validated with `class-validator`; never accept `role` or `credit_balance` from a client-side DTO.
- Secrets (`gsc_refresh_token`, provider credentials, service-account keys) encrypted at rest with a KMS/libsodium
  helper in `common/crypto`. Log nothing that contains them.
- `AuditInterceptor` on every mutating staff endpoint: actor, action, target, metadata, IP.
- Rate limits via `@nestjs/throttler` with Redis store: submissions per user, login attempts per IP, chat messages per socket.
- Errors: return `{ code, message }`; codes are stable strings the frontend switches on (`INSUFFICIENT_CREDITS`,
  `QUOTA_EXHAUSTED`, `DUPLICATE_TRX`).

## Build order (do these in sequence; finish and test each before the next)

1. Drizzle schema from SQL + payments tables; migrations; seed superadmin, one manager, credit packs, payment methods
2. Auth: register → verify → pending → approve → login; email templates; manager auto-assign
3. RBAC guards + admin user list/assign-manager + manager approval drawer
4. Credits ledger + manual add + Redis balance cache
5. Sites: IndexNow key, Search Console OAuth
6. Indexing: provider registry, submit flow with credit deduction, BullMQ workers, status checks, dashboard stats
7. Payments: manual request flow + manager review queue; then aamarPay session + IPN
8. Tickets
9. Live chat integration
10. Superadmin provider + payment-method management, audit log view
11. Public REST API + API keys, CSV/sitemap import

## Definition of done for every task

- Unit tests for services with money or permissions in them (credits, payments, guards)
- One e2e test per HTTP flow touched
- No `any` in new code; no TODOs without an issue reference
- Run migrations against a Neon branch, not main
- Screens match the corresponding `desktop-*.png` at 1440px and collapse cleanly at 390px
