# 0011: A credit ledger gates submissions — this is not the deferred billing system

## Status

Accepted.

## Context

Researching four competing "instant indexing" products (see the session this
was built in) surfaced credit-based pay-as-you-go pricing as a real,
legitimate enterprise pattern worth adopting, independent of the parts of
those products' marketing that weren't legitimate (see
[ADR 0001](./0001-indexnow-only-instant-submission.md)'s reasoning, extended
in that same research pass, for why FoxIndex doesn't chase Google-indexing
claims the way those competitors do). `docs/future-modules.md` and
`docs/future-schema.md` already named **Billing** — `plans`, `subscriptions`,
`usage_records`, a Stripe integration — as intentionally deferred past
Phase 1, with the explicit stated philosophy that an unused table or
scaffolded module is "dead code with extra steps" and "a maintenance burden
with no offsetting value."

A credit ledger that actually gates submissions is real, exercised
functionality, not scaffolding — but it sits in the same vocabulary space as
that deferred Billing entry, so the line between them needs to be explicit
rather than assumed.

## Decision

`organizations.credit_balance` + an append-only `credit_ledger` table is a
**non-monetary usage-gating primitive**, not the billing system. It tracks
how many URL submissions an organization has permission to make; it has no
concept of money, a plan tier, a billing period, or a payment provider. New
organizations get a 50-credit signup bonus (`CreditLedgerReason.SIGNUP_BONUS`)
granted atomically alongside their creation. Submitting a URL deducts exactly
one credit; insufficient balance rejects that URL with
`SubmissionFailureReason.INSUFFICIENT_CREDITS` — the same per-URL rejection
shape `DOMAIN_NOT_VERIFIED` used before [ADR 0010](./0010-domain-verification-not-required-to-submit.md)
removed it as a hard gate.

**Confirmed with the user before building this:** there is no self-serve way
to acquire credits yet. `pnpm credits:grant <org> <amount>` is a developer-run
CLI script (`packages/database/src/grant-credits.ts`), not a public API
endpoint — a "grant yourself free credits" button would be a fake feature
shipped in a real product surface. Real self-serve purchasing (Stripe
Checkout, `plans`/`subscriptions`/`usage_records`) remains exactly what
`future-modules.md`'s Billing entry already described, and is the natural
fast-follow once this ledger mechanic is proven live — not built in this pass.

## Atomicity

Deduction is a single conditional `UPDATE ... WHERE credit_balance >= amount
RETURNING credit_balance` (no read-then-write race) plus a ledger insert, and
both run inside the *same* transaction as the URL upsert and submission-row
creation. This isn't incidental: `IdempotencyInterceptor` explicitly permits
a client to retry a request with the same `Idempotency-Key` after any handler
error (it only replays a *cached success*, and calls `cache.release()` on
error). Without the shared transaction, "deduct succeeds, then the
submission row's insert throws" would be a real, retriable state that could
double-charge a credit with nothing to show for it. `packages/database/src/client.ts`
gains an exported `Transaction` type (the standard Drizzle
`Parameters<Parameters<Database['transaction']>[0]>[0]` idiom) so
`UrlsRepository.upsert` and `SubmissionsRepository.create` can accept an
optional trailing `tx` and compose into a caller's transaction instead of
always opening (and committing) their own.

The same reasoning applies to org creation: the 50-credit signup grant runs
inside `OrganizationsRepository.createWithOwner`'s existing transaction (which
already atomically creates the org + the OWNER membership row) rather than as
a separate call afterward — an org that exists with no credits, or credits
granted to an org-creation that then rolled back, are both states worth
avoiding by construction rather than by hoping nothing fails in between.

## Bulk submission — lowered, not raised, based on what was actually measured

The original intent was to raise `MAX_URLS_PER_SUBMISSION_REQUEST` from 100.
Measured live against real Neon instead of guessing: three precisely-timed
batches (10, 10, 20 URLs) took 52.4s, 52.2s, and 92.5s. That works out to
roughly a 12s fixed request cost plus ~4s per URL — because credit deduction
adds two more sequential writes (the conditional balance `UPDATE` + a
`credit_ledger` insert) to every URL's transaction, on top of the URL
upsert and submission-row insert that were already there. Per-URL DB
round trips roughly doubled by adding credits.

At that rate, the *original* cap of 100 would already have meant ~7 minutes
per request, and 500 would have meant over half an hour — both far worse
than shipping no increase at all. `MAX_URLS_PER_SUBMISSION_REQUEST` was
**lowered to 20** (measured at ~93s, well within what a synchronous request
can reasonably ask a user to wait for), not raised, and the web submit
page's copy says so explicitly ("can take up to a minute or two"). The
`.csv`/`.txt` file upload (reads client-side via `FileReader`, appends into
the existing textarea, no server-side multipart handling) is still worth
having at this scale — it's still faster than pasting 20 URLs by hand.

The real, correct fix for actual bulk (hundreds or thousands of URLs) is
what stays explicitly deferred: batched SQL (one multi-row credit
deduction and one multi-row insert per batch instead of one round trip per
URL) combined with async processing and progress tracking, not a bigger
number on the same sequential-per-URL loop. This measurement is the
concrete case for why — the bottleneck is round-trip count, and only a
different query shape fixes that; a bigger synchronous cap on today's shape
just makes requests take longer.

## Consequences

- Every future write to `organizations.credit_balance` must go through
  `CreditsRepository`'s conditional-update pattern (or the CLI script's
  duplicate of it) — never a plain `UPDATE organizations SET credit_balance
  = ...` anywhere else, or the atomicity/audit-trail guarantee breaks silently.
- `OrganizationsRepository` gained a repository-to-repository dependency
  (`@Inject(CreditsRepository)`) — a deliberate, single exception to this
  codebase's usual service-to-service composition, made specifically so the
  signup bonus can share the existing org-creation transaction rather than
  duplicating ledger-writing logic a third time.
- `SubmissionsService` now injects `DATABASE` directly (previously it only
  touched the database through repositories) — the one place in this service
  that needs to compose three repositories' writes into a single transaction
  it owns.
- A refund-on-failure policy (crediting back a submission that IndexNow
  itself later rejects) is a natural next step some competitors offer, and is
  *not* built here — Phase 1's credit deduction happens at accept/enqueue
  time, unconditionally, keeping this pass's scope to the atomic mechanic
  itself.
