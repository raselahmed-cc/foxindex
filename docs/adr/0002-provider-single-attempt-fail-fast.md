# 0002: Providers make one attempt and never retry internally

## Status

Accepted.

## Context

`IndexNowProvider.submit()` calls IndexNow exactly once per BullMQ job and
maps the HTTP response into a normalized `SubmissionResult` (accepted/
rejected URLs, an `errorCode`, whether it's `retryable`, an optional
`retryAfterMs`). The question is where retry logic itself should live: an
individual `IndexingProvider` implementation could sleep-and-retry
internally before returning, or that responsibility could belong entirely
to the caller.

## Decision

Providers never retry. They make one HTTP call, classify the outcome, and
return immediately — a 429 becomes `{retryable: true, retryAfterMs}`, a
network error becomes `{retryable: true}`, a 400/403/422 becomes
`{retryable: false}`. All actual retry orchestration — attempt count,
exponential backoff, giving up — is BullMQ's job (`attempts: 5`,
exponential backoff starting at 2s, configured where the job is enqueued).

This is paired with the job payload shape being singular: one BullMQ job =
one URL = one IndexNow call (an array of one), even though IndexNow's own
API accepts a URL list. True request-level batching (N URLs in one
IndexNow call) is a Phase 2 optimization, not built now.

## Consequences

- Adding a second provider (Phase 2's Google Search Console integration —
  see [ADR 0001](./0001-indexnow-only-instant-submission.md)) means
  implementing `IndexingProvider`/`StatusCheckingProvider` and registering
  it with `ProviderRouter` — no changes to the submission worker's retry
  handling, because the worker doesn't know or care which provider it's
  calling.
- Retry policy is configured in exactly one place (the queue producer),
  not scattered across every provider implementation, and is uniform
  across providers by construction.
- The cost: no request-level batching in Phase 1, so submitting 100 URLs
  in one API call still produces 100 separate IndexNow HTTP calls (100
  separate BullMQ jobs). This is fine at walking-skeleton scale and is an
  explicit, deferred optimization, not an oversight.
