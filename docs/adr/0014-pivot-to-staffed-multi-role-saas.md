# 0014: Pivot from the single-owner walking skeleton to a staffed, multi-role SaaS

## Status

Accepted.

## Context

The project so far has been built as a deliberately minimal walking skeleton: a
single global owner per project, no organization or role hierarchy beyond
Admin/Super Admin ([ADR 0013](./0013-flatten-to-project-single-indexnow-key.md)),
IndexNow as the only indexing provider by explicit choice
([ADR 0001](./0001-indexnow-only-instant-submission.md)), and a credit ledger
that is a non-monetary usage gate rather than a billing system, with real
payments explicitly deferred to a later Stripe integration
([ADR 0011](./0011-credit-ledger-not-billing.md), `docs/future-modules.md`).

A new product direction, captured in the repo root's `CLAUDE.md`, calls for a
staffed indexing agency instead: four roles (`client`/`manager`/`admin`/
`superadmin`) with manager-to-client assignment, a human approval step on every
signup, a real payments system (manual review + aamarPay), support tickets,
in-house live chat, WhatsApp notifications, and Google Indexing API +
Search Console alongside IndexNow. This is a deliberate, confirmed scope
expansion, not an incremental extension of the walking skeleton — several of
the walking skeleton's own decisions are being reversed on purpose.

## Decision

`CLAUDE.md` is now the authoritative specification for this project. Where any
existing ADR, `future-modules.md`, or `future-schema.md` conflicts with it,
`CLAUDE.md` wins, and the build proceeds through its own numbered Build Order
(schema → auth → RBAC → credits → sites → indexing → payments → tickets → live
chat → superadmin panels → public API), each phase finished and tested before
the next starts.

**Explicitly superseded:**

- [ADR 0001](./0001-indexnow-only-instant-submission.md) — IndexNow-only is no
  longer the design; Google Indexing API + Search Console are in scope per
  `CLAUDE.md`'s indexing pipeline section.
- [ADR 0009](./0009-verification-email-callback-url.md) — specific to a
  Better Auth implementation detail; auth is being replaced with custom
  JWT access/refresh + argon2, so the whole mechanism this ADR patched no
  longer exists once Build Order step 2 lands.
- [ADR 0011](./0011-credit-ledger-not-billing.md) — the "this is not billing"
  framing no longer holds; `CLAUDE.md` specifies real payments
  (`payments`, `payment_methods`, `credit_packs`, aamarPay) feeding the same
  ledger concept. The atomicity mechanic it documents (conditional update +
  ledger insert in one transaction) is still the right pattern and should
  carry forward into the new `credit_transactions` implementation, per this
  project's convention of keeping a mechanism when only its scoping changes.
- [ADR 0013](./0013-flatten-to-project-single-indexnow-key.md) — the
  single-owner, no-role, no-organization model is replaced by the four-role
  hierarchy with manager-assigned clients. Note this ADR itself superseded
  [0003](./0003-domain-verification-as-async-queue.md),
  [0010](./0010-domain-verification-not-required-to-submit.md), and
  [0012](./0012-auto-create-domain-on-submit.md) — those remain historical
  through 0013 and now, transitively, through this ADR.

**Extended, not contradicted:**

- [ADR 0002](./0002-provider-single-attempt-fail-fast.md) — providers still
  make one attempt and classify the outcome; `CLAUDE.md`'s `index:retry`
  queue (max 3, next provider) is retry orchestration living in the queue
  layer, exactly where 0002 already put it. Multi-provider fallback is new,
  the "providers don't retry internally" rule is not.
- [ADR 0004](./0004-idempotency-redis-primary.md) — the Redis-primary
  idempotency mechanism is unchanged; its scoping key moves again, from
  `userId` (post-0013) to whatever the new schema's submission-owning entity
  is once Build Order step 1 lands.

**Unaffected** (general engineering conventions, not product scope):
[ADR 0005](./0005-no-native-dlq-postgres-source-of-truth.md),
[ADR 0006](./0006-nestjs-explicit-dependency-injection.md),
[ADR 0007](./0007-ssrf-test-escape-hatch.md),
[ADR 0008](./0008-env-loading-bootstrap-shim.md).

## Consequences

- This is a lossy, one-way cutover of the current dev database's schema and
  data, same as [ADR 0013](./0013-flatten-to-project-single-indexnow-key.md)
  was — accepted for the same reason: no production system with paying
  customers exists yet.
- `indexing_saas_schema.sql`, `foxindex-designs.html`, `desktop-*.png`, and
  `live-chat-module.zip` are named in `CLAUDE.md` as already-delivered source
  files this build reads from. None exist in this repo yet — they must be
  added (or their content drafted from `CLAUDE.md`'s prose) before Build
  Order step 1 (schema) and step 9 (chat) can start for real.
- Better Auth (`packages/auth`) is removed once custom JWT/argon2 auth lands
  in Build Order step 2; every ADR and piece of code that assumed Better
  Auth (session cookies, `additionalFields`, `databaseHooks`) becomes
  historical at that point, not just this one.
- `future-modules.md`'s Billing entry (Stripe) is superseded by `CLAUDE.md`'s
  aamarPay-based payments design — Stripe is no longer the planned gateway.
