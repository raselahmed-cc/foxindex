# Deferred Schema

Tables named by the constitution's full entity list that do not exist in
`packages/database/src/schema` yet, grouped by the [future
module](./future-modules.md) that would introduce them. None of these are
scaffolded as empty Drizzle tables — an unused table is still a schema
migration and a maintenance burden with no offsetting value, so they're
documented here as shape sketches, not committed code, until the module
that needs them actually gets built.

## Teams

- **`teams`** — `id`, `organization_id`, `name`, `created_at`
- **`team_members`** — `team_id`, `user_id`, unique `(team_id, user_id)`

Would let a project/domain optionally scope to a team instead of the whole
organization. `organization_members` and the `Role` enum already cover
Phase 1's org-wide membership needs.

## Index status (Google Search Console)

- **`oauth_connections`** — `organization_id`, `provider` (`GOOGLE`),
  encrypted refresh token, `expires_at`, the Search Console property URL
  it's scoped to
- **`index_checks`** — `url_id`, `provider`, requested-at/completed-at,
  raw provider response
- **`index_status_history`** — append-only, `url_id`, `status`
  (`INDEXED`/`NOT_INDEXED`/`CRAWLED_NOT_INDEXED`/etc. — richer than
  `UrlSubmissionState` allows, since GSC's actual status vocabulary is
  wider than "submitted or not"), `checked_at`

This is what would finally give `UrlSubmissionState.INDEXED` /
`NOT_INDEXED` a real code path — see
[ADR 0001](./adr/0001-indexnow-only-instant-submission.md).

## Sitemaps

- **`sitemaps`** — `project_id`, `domain_id`, `url` (the sitemap.xml
  location), `last_fetched_at`, `last_fetch_status`
- **`sitemap_urls`** — `sitemap_id`, `url_id`, `lastmod`/`priority` from
  the sitemap entry itself

## Automations

- **`automations`** — `project_id`, trigger (`ON_SITEMAP_CHANGE` /
  `SCHEDULED`), target (which domain/sitemap), enabled
- **`automation_runs`** — append-only, `automation_id`, started/completed,
  how many URLs it submitted, outcome

## Webhooks

- **`webhooks`** — `organization_id`, target URL, subscribed event types,
  HMAC signing secret, enabled
- **`webhook_deliveries`** — append-only, `webhook_id`, event payload,
  attempt count, last HTTP status, next retry time

## Billing

- **`plans`** — tier definitions (name, included submission volume, price)
- **`subscriptions`** — `organization_id`, `plan_id`, provider
  (Stripe) customer/subscription IDs, status, current period
- **`usage_records`** — append-only, `organization_id`, metric
  (`urls_submitted`), period, count — the metering source of truth billing
  would read from

`organizations.credit_balance` and `credit_ledger` already exist and are
distinct from all three of the above — see
[ADR 0011](./adr/0011-credit-ledger-not-billing.md). They're a non-monetary
usage-gating primitive (submissions deduct credits; insufficient balance is
rejected), not a plan/subscription/payment system.

## Notifications

- **`notifications`** — `organization_id`, `user_id` (nullable = org-wide),
  type, payload, `read_at`

## Rate-limiting durability

- **`api_requests`** — would give durable, queryable per-request logging
  beyond the Redis sliding window `@nestjs/throttler` uses today. Only
  worth adding once something (billing, abuse investigation) actually
  needs to query historical request volume rather than just enforce a
  live limit.
