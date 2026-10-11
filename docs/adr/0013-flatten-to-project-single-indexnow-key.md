# 0013: Flatten organizations/domains away — project owns one IndexNow key, add global Admin/Super Admin

## Status

Accepted.

## Context

Phase 1/2A built a full multi-tenant model: organizations → projects →
domains → submissions, with org-scoped roles (OWNER/ADMIN/MANAGER/
SEO_MANAGER/DEVELOPER/VIEWER), per-domain IndexNow keys, and a
`workers/verification` worker to check key-file hosting. Using the actual
product surfaced two problems: setting up an organization and verifying a
domain before submitting a single URL was friction nobody asked for, and
there was no way to run FoxIndex itself — no path to add credits to a
customer, no path to see who the customers even were, beyond a raw SQL
console. "Everything looks meaningless" without operator tooling, and the
multi-tenant model wasn't earning its complexity for a single-user-per-org
product in practice.

Feedback converged, over several rounds, on:

1. Add global **Admin** (can grant credits) and **Super Admin** (Admin's
   powers plus provider configuration) roles — a real operator surface,
   not a feature that doesn't exist yet.
2. Remove **organizations** entirely — a user owns their own projects
   directly, no membership/role layer between them.
3. Remove **domains** entirely, going further than
   [ADR 0012](./0012-auto-create-domain-on-submit.md)'s auto-created-but-
   still-a-real-entity domains — a **project** gets exactly one IndexNow
   key, generated at creation, used for every URL submitted under it,
   regardless of hostname.

Point 3's tradeoff was made explicit and accepted: a project's one key only
really works cleanly when everything submitted under it lives on one real
website, because IndexNow's own key-file check (unchanged since
[ADR 0010](./0010-domain-verification-not-required-to-submit.md)) will
reject any URL whose host doesn't actually serve that key. A user who
wants to submit URLs across unrelated sites now needs one project per
site — a deliberately simpler mental model ("a project is a site") traded
for the flexibility multi-domain projects used to offer.

## Decision

**Removed entirely:** `organizations`, `organization_members`, `domains`,
`domain_verifications` tables and their API modules; `workers/verification`
(nothing left to verify — a project's key is generated and used directly,
no per-domain proof-of-ownership step); the `verification` BullMQ queue.

**`user` (Better Auth's own table) gains two columns**, via `additionalFields`
in `packages/auth/src/auth.ts` rather than a hand-edited migration (this
project's established convention — `packages/database/src/schema/auth.ts`
is regenerated via `pnpm auth:generate`, never hand-edited):

- `role`: `UserRole` (`USER` default, `ADMIN`, `SUPER_ADMIN`) — global, not
  per-resource. Both new fields are `input: false`, so a signup request
  can't set its own role or balance.
- `creditBalance`: moved here from `organizations.creditBalance` — credit
  is now a per-user concept, which is also what makes "Admin grants
  credits" a coherent single-target action instead of "credits to which
  org?" Confirmed directly against the installed `better-auth` package
  that `additionalFields` merge into the session payload automatically —
  `AuthGuard` needs no extra DB lookup to read `request.user.role`.

**`projects`** keeps its shape but `userId` (owner) replaces
`organizationId`, and it gains `indexnowKey` (generated once at creation,
via the same `generateIndexNowKey()` used by the old per-domain model).
Everything under a project (`urls`, `url_submissions`, `api_keys`) drops
`organizationId`/`domainId`, keeps `projectId`. `url_submissions` and
`credit_ledger` and `audit_logs` gain a denormalized `userId` (the
project's owner) so per-user queries and the idempotency unique index
don't need a join. `api_keys.projectId` becomes required — there is no
more "org-wide" key, since there's no more org.

**New `provider_settings` table** — a Super-Admin-managed runtime override
for a provider's `apiBaseUrl` (IndexNow only, for now). `apiBaseUrl: null`
means "use the env var default" — this table only ever narrows the
existing fallback chain, never replaces it. This is genuine infrastructure
for whenever a second real provider exists, not a promise of providers
that don't exist — "multiple indexing APIs" in the original ask meant "a
real settings screen," not fabricating a second "instant Google index" API
(constitution's honesty principle rules that out regardless).

**Guards:** `TenantContextGuard` is deleted, replaced by a much thinner
`ProjectOwnershipGuard` — resolves `:projectId`, loads the project, checks
`project.userId === request.user.id` (session) or
`apiKey.projectId === project.id` (API key), 404s on mismatch. Single-hop
by design: every route it guards now nests under `/projects/:projectId/...`,
so there's no more multi-hop resolution like the old flat `/urls/:urlId`.
`RolesGuard` is repurposed, not deleted — `@Roles(...)` now checks the
global `UserRole` and is used only by the new `admin` module; every
project/submission/api-key/credits route is authorized entirely by
`ProjectOwnershipGuard` now, since a project has exactly one owner and
there's no org-role spectrum left to check.

**New API surface:** `POST/GET /projects`, `GET/PATCH /projects/:projectId`
(owner-scoped, no more `/organizations/:id/projects`); submission/API-key
routes fully nested under `/projects/:projectId/...`; `GET /credits` (the
session user's own, no id param — replaces `/organizations/:id/credits`);
`GET /admin/users`, `POST /admin/users/:userId/credits/grant` (Admin+);
`GET/PUT /admin/providers` (Super Admin only).

`SubmissionsService.submitUrls()` no longer resolves anything per URL at
all — no domain lookup, no key lookup even. The API layer only needs the
project's `userId` (for credit deduction) and `id` (denormalized onto the
job payload); `workers/submission` itself reads the project's
`indexnowKey` fresh from the DB at send time, so a Super Admin's provider
change or a (hypothetical, not yet built) key-rotation takes effect
without re-touching the queued job.

**Starter credits**, previously granted transactionally inside
`OrganizationsRepository.createWithOwner()` when an org was created, move
to a Better Auth `databaseHooks.user.create.after` hook in
`packages/auth/src/auth.ts` — the only "a user just signed up" moment left
in the new model. It grants `STARTER_CREDIT_BALANCE` and writes a
`SIGNUP_BONUS` ledger row in one transaction, same shape as every other
credit mutation (docs/adr/0011).

## Consequences

- This is a lossy, one-way cutover of the real dev Neon database's
  existing test organization/project/domain/submission data — accepted
  because this has been a dev/test database throughout the project, not a
  production system with paying customers. The migration backfills what's
  safely inferable (each project's sole org OWNER becomes its `userId`)
  before dropping the old tables, verified live rather than assumed.
- A project's single IndexNow key only works cleanly for URLs on one real
  website — a deliberate simplification, not an oversight. A user with
  multiple unrelated sites now needs one project per site.
- `packages/ssrf-fetch` stays, unused for now — it's already the package
  named in `docs/future-modules.md` as what a future crawler worker will
  reuse, unlike `urlBelongsToHostname` (ADR 0012), which had zero
  remaining purpose and no documented future consumer.
- [ADR 0003](./0003-domain-verification-as-async-queue.md),
  [ADR 0012](./0012-auto-create-domain-on-submit.md), and the domain-
  related parts of [ADR 0010](./0010-domain-verification-not-required-to-submit.md)
  now describe a superseded model — left as historical record with a
  pointer to this ADR rather than rewritten, per this project's ADR
  convention.
- No UI can create the first Admin/Super Admin — the very first one is
  bootstrapped with a direct database update, same as any system's first
  operator account.
