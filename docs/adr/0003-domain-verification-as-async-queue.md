# 0003: Domain verification is a real BullMQ queue, not an inline API call

## Status

Accepted.

## Context

`POST /projects/:id/domains/:id/verify` has to fetch a URL the *user*
supplied (their own domain's key-file location) and check its contents.
That outbound fetch could happen synchronously inside the request handler
(simplest to write, and verification is usually fast) or be handed off to
a worker via the same queue-first pattern the constitution mandates for
the submission pipeline.

## Decision

Verification is enqueued, not inline. `DomainsService.requestVerification()`
enqueues a `verification` job and returns `{enqueued: true}` immediately;
`workers/verification` picks it up, calls `safeFetch()` against the key
file, and writes the result (`domain_verifications` row +
`domains.verification_status`) back to Postgres.

## Consequences

- The API stays stateless and fast under load even if a user's DNS/server
  is slow or unresponsive — a slow key-file fetch blocks a worker slot,
  never an API request thread. This matters more here than it might seem:
  the fetch target is fully user-controlled (whatever hostname they typed
  in), so response time is not something the API can bound by its own
  design the way a call to a fixed, trusted endpoint like IndexNow can be.
- Retry behavior is uniform with submission: BullMQ owns attempts/backoff
  (`attempts: 3`), and a genuinely down key file gets retried automatically
  rather than the API having to implement its own retry loop.
- The dashboard's domain page reflects this: verification status updates
  asynchronously, and the UI polls/reloads rather than assuming the
  `POST .../verify` response already reflects the final outcome. (An
  early version of the domain page's own polling — a single `setTimeout`
  reload 3 seconds after clicking "Verify now" — didn't account for
  verification legitimately taking longer than that; `tests/e2e`'s
  golden-path spec polls with actual retries for exactly this reason
  rather than trusting a fixed delay.)
- This is the same shape `workers/crawler`/`sitemap`/`diagnostics` will use
  once built (see [future-modules.md](../future-modules.md)) — verification
  is the proof that the queue-first worker pattern works before more
  workers are built on top of it.
