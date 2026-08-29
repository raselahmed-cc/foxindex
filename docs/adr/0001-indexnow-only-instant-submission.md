# 0001: IndexNow is the only Phase 1 submission provider — no Google bypass

## Status

Accepted.

## Context

FoxIndex's core promise is fast, legitimate URL discovery/indexing
submission. "Instant indexing" needs an honest, concrete meaning before any
code gets written, because the obvious interpretation — "push a URL and
Google indexes it right away" — doesn't correspond to anything Google
actually offers for arbitrary content:

- **IndexNow** (Bing, Yandex, Naver, Seznam, Yep — not Google) is a real,
  push-based, multi-engine protocol. A hex key hosted as a text file at the
  domain root both proves ownership *and* authorizes future submissions,
  so it can double as domain verification.
- **Google's Indexing API** is officially restricted to `JobPosting` /
  `BroadcastEvent` structured content. Using it for arbitrary pages
  violates Google's terms.
- **Search Console's URL Inspection API** is read-only status/diagnostics,
  gated behind the *user's own* OAuth-verified property, rate-limited to
  2,000 queries/day/property. It can report status; it cannot cause
  indexing.
- Automating the "Request Indexing" button in the Search Console UI is not
  a public API. Building it would be exactly the bypass technique this
  product must not offer.

## Decision

Phase 1 registers exactly one `IndexingProvider`: `IndexNowProvider`.
Google integration (Search Console's URL Inspection API, for *status*, not
submission) is deferred to Phase 2 and requires the user to bring their own
OAuth app — see
[future-modules.md](../future-modules.md#google-search-console-integration).
Automating the Search Console UI button is out of scope permanently, not
just deferred.

This decision reaches into the type system: `UrlSubmissionState` models
`MONITORING`, `INDEXED`, and `NOT_INDEXED` as real enum values (because
they're part of the product's eventual lifecycle once a status-checking
provider exists), but no Phase 1 code path ever produces them — IndexNow
has no status-confirmation API, so a Phase 1 submission only ever moves
through `RECEIVED → VALIDATING → ACCEPTED → QUEUED → PROCESSING`, ending
at `SUBMITTED` or `FAILED`. `workers/submission/src/processors/process-submission.spec.ts`
asserts this directly: across every scenario it exercises, none of
`MONITORING`/`INDEXED`/`NOT_INDEXED` is ever among the states the worker
writes.

## Consequences

- The product must be honest, in copy and in the state machine, that a
  submission reaching `SUBMITTED` means the push was accepted by IndexNow's
  participating engines — not that any engine, and never Google, has
  indexed the page. The web app's submit page says this explicitly.
- Adding Google status-checking later is additive: a new
  `SubmissionProvider` enum value, the `oauth_connections` table, a
  `GoogleSearchConsoleProvider` implementing `StatusCheckingProvider`
  (already defined in `packages/providers`, unimplemented), and the state
  machine's `INDEXED`/`NOT_INDEXED` transitions become reachable for the
  first time — without changing anything about how `IndexNowProvider` or
  the submission worker work today.
- No code anywhere may attempt to trigger Google indexing outside the
  documented, terms-compliant surfaces above.
