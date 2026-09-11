# Deferred Modules

Everything below is named in the FoxIndex constitution but intentionally
**not** built in Phase 1, per the walking-skeleton scope: building every
module before the golden path runs end to end would itself violate the
constitution's own incremental-delivery principle. Nothing here is
scaffolded as an empty module, stub controller, or unused package — that
would just be dead code with extra steps. This document is where the
intent lives until each one gets its own milestone.

## Billing

Plans, subscriptions, usage-based metering, invoicing. Needs a payment
provider integration (Stripe, most likely) and the `plans` /
`subscriptions` / `usage_records` tables in
[future-schema.md](./future-schema.md).

**Not the same as the credit ledger** (`organizations.credit_balance` /
`credit_ledger`, [ADR 0011](./adr/0011-credit-ledger-not-billing.md)), which
does exist and does gate submissions — it's a non-monetary usage primitive
with no plan tiers, billing periods, or payment provider. Credits are
currently granted only via a developer-run CLI script
(`pnpm credits:grant`); *this* entry is what a real self-serve purchase flow
(Stripe Checkout topping up that same balance) would look like once built.

## Bulk submission at real scale

`MAX_URLS_PER_SUBMISSION_REQUEST` is 20 — measured live against real Neon
(see [ADR 0011](./adr/0011-credit-ledger-not-billing.md)) to be roughly
what a single synchronous request can process in under two minutes with
today's sequential, one-round-trip-per-URL submission loop. Hundreds or
thousands of URLs in one submission — what some competitors offer — needs
two things this doesn't have yet: batched SQL (one multi-row credit
deduction and one multi-row insert per batch, not one round trip per URL)
and async processing with progress tracking, rather than a bigger number
on the same loop. The ADR has the measured numbers behind why a bigger
synchronous cap alone would make things worse, not better.

## Webhooks (outbound)

Letting a tenant register a URL to receive events (`submission.completed`,
`domain.verified`, etc.). Needs `webhooks` / `webhook_deliveries` tables, a
signing scheme (HMAC), retry/backoff on delivery failure, and the
`webhook` BullMQ queue (already reserved in `packages/queue`'s
`QUEUE_NAMES`, unused).

## Teams

Organization membership already exists (`organization_members` with the
full `Role` enum), and route-level `@Roles()` checks already work — what's
deferred is *team*-scoped resources (a team owning a subset of a project's
domains, rather than every member seeing everything) and the
`teams` / `team_members` tables. Phase 1 only distinguishes
OWNER/ADMIN/MANAGER-tier from member-tier per route; finer-grained,
per-resource role checks are Phase 2.

## Google Search Console integration

The URL Inspection API can report a page's actual Google index status, but
it's read-only, gated behind the *user's own* OAuth-verified Search Console
property, and rate-limited to 2,000 queries/day/property. Building this
means the user registers their own Google Cloud OAuth app — real product
work (OAuth flow, token storage/refresh, per-property quota tracking), not
something FoxIndex can offer out of the box the way IndexNow submission is.
This is also what would eventually populate `UrlSubmissionState.INDEXED` /
`NOT_INDEXED` and give `StatusCheckingProvider` (already defined in
`packages/providers`' types, never implemented) its first real
implementation. See
[ADR 0001](./adr/0001-indexnow-only-instant-submission.md). Needs the
`oauth_connections` and `index_checks` / `index_status_history` tables.

**Explicitly out of scope, not just deferred:** automating the "Request
Indexing" button in the Search Console UI. That's not a public API, and
building it would be exactly the kind of bypass technique the constitution
rules out.

## Sitemap / crawler / diagnostics workers

`workers/crawler`, `workers/sitemap`, `workers/diagnostics` exist today as
README-only stub directories — deliberately *not* registered as pnpm
workspace packages, so they don't generate empty-package noise in
`pnpm turbo run *`. Their queue names (`crawler`, `sitemap`,
`diagnostics`) are already reserved in `packages/queue`.

- **Sitemap**: parse a submitted sitemap.xml, extract URLs, feed them into
  the same submission pipeline manually-submitted URLs go through today.
  Needs `sitemaps` / `sitemap_urls` tables.
- **Crawler**: fetch a submitted page (SSRF-safe, same `packages/ssrf-fetch`
  used by domain verification) to check basic indexability signals
  (status code, `robots.txt`/`meta robots`, canonical tag).
- **Diagnostics**: aggregate crawler output into a per-URL indexability
  report shown in the dashboard.

## Notifications

In-app / email notifications (a submission finally failed after retries, a
domain lost verification, etc.). Needs the `notifications` table and the
already-reserved `notification` queue. `audit_logs` already has a write
path (constitution-mandated, several golden-path actions need it
regardless), but nothing reads it into a notification yet.

## Observability stack

Constitution calls for OpenTelemetry tracing + Prometheus metrics +
Grafana dashboards. Phase 1 has structured JSON logging (pino, with secret
redaction) and nothing else — no metrics exporter, no tracer, no
dashboards. Structured logs are what `submission_attempts` /
`domain_verifications` already give you for debugging a specific
tenant's request; the observability stack is for aggregate, cross-tenant
operational visibility, which doesn't matter yet at walking-skeleton scale.

## Terraform / Kubernetes

`infrastructure/terraform/README.md` and `infrastructure/cloudflare/README.md`
are placeholders. Phase 1's deploy target is plain Docker Compose
(`infrastructure/docker/docker-compose.staging.example.yml`) against
managed Neon/Upstash — no cloud provider, no K8s cluster, no IaC exists to
provision one. See `docs/deployment.md` for the current (non-)deployment
state.

## Object storage (S3-compatible)

Nothing in Phase 1 needs to store a file (no sitemap uploads, no exported
reports, no crawler screenshots) — `packages/storage` is not scaffolded
empty. Add it when the first real feature needs it, not before.

## Rate limiting durability

Phase 1 uses `@nestjs/throttler` backed by Redis for request rate limiting
— no durable `api_requests` table. That's fine for the throttling itself,
but it means there's no long-term, queryable log of API usage. Revisit
once usage-based billing needs durable, auditable rows rather than a
sliding Redis window.
