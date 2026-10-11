# 0004: Idempotency is Redis-primary; the DB column is defense-in-depth

> **Scoping key updated by [ADR 0013](./0013-flatten-to-project-single-indexnow-key.md).**
> The mechanism below is unchanged; every `organizationId` mentioned here is
> now `userId` (there is no organization left to scope by).

## Status

Accepted.

## Context

`POST /projects/:id/submissions` accepts an optional `Idempotency-Key`
header and a batch of 1–100 URLs in one request. A retried request (same
key) must replay the original response rather than re-processing. Two
places could enforce this: a unique DB constraint on
`url_submissions.idempotency_key`, or a Redis-backed cache keyed by
`(organizationId, key)` that locks and stores the full response.

## Decision

Redis is the primary mechanism: `IdempotencyInterceptor` +
`IdempotencyCache` do an `NX`-locked check-and-set keyed by
`(organizationId, idempotencyKey)` before the request handler runs, and
replay the cached response on a hit. `url_submissions` also carries a
partial unique index —
`(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL` —
but only as defense-in-depth and traceability, not as the primary
enforcement mechanism.

The reason Redis has to be primary, not just a fast path in front of the
DB constraint: a single idempotent request submits a *batch* of up to 100
URLs, which becomes multiple `url_submissions` rows. A DB unique
constraint keyed on the submission's own idempotency key column can dedupe
individual rows, but it can't atomically represent "this whole batch
request, and everything it did, already happened" the way a single cached
response keyed on the request itself can.

## Consequences

- The full response — including the per-URL accepted/rejected breakdown —
  is what gets replayed on a retry, not just "this key was seen before."
  A client retrying after a network blip gets exactly what the original
  request would have returned, not a generic 409.
- Idempotency correctness depends on Redis being available. If Redis is
  down, the interceptor fails closed or open depending on its own error
  handling (see `IdempotencyInterceptor`'s implementation) rather than
  silently falling back to the DB constraint, which cannot reconstruct a
  full batch response anyway.
- The DB column still matters: it's what a support/debugging query against
  `url_submissions` uses to find "which rows came from this specific
  idempotent request," independent of whether the Redis cache entry has
  since expired.
