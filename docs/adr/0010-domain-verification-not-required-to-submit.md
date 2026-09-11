# 0010: Domain verification is no longer required before submitting URLs

## Status

Accepted — supersedes the submission-gating half of the original design
(the queue/worker shape from [ADR 0003](./0003-domain-verification-as-async-queue.md)
is unchanged; only whether `submitUrls()` blocks on verification status changes).

## Context

The original implementation rejected `POST /projects/:id/submissions` up
front with `DOMAIN_NOT_VERIFIED` whenever `domain.verificationStatus !==
VERIFIED`, before creating any row or enqueuing anything. The reasoning at
the time: the IndexNow key that verifies domain ownership is the same key
that authorizes submissions for it, so requiring verification first looked
like enforcing IndexNow's own authorization model early, with a faster,
clearer error.

Revisited: FoxIndex's own `verification_status` column is *not* the real
authorization boundary — it's our own worker's most recent attempt to
confirm the key file is hosted. IndexNow's servers make that exact same
check independently, for real, at submission time, regardless of what our
database says. Blocking on our own status meant a user whose key file was
hosted correctly but whose verification attempt happened to fail for an
unrelated reason (a transient timeout, or verification simply never being
attempted) was blocked from something that would have genuinely succeeded.
Conversely, removing our check doesn't create a way to fake a real
submission — IndexNow will still reject anything for a domain that hasn't
actually hosted the key, exactly as it always would have.

## Decision

`SubmissionsService.submitUrls()` no longer checks `domain.verificationStatus`
at all. A URL that belongs to the given domain (`urlBelongsToHostname`) is
accepted and enqueued regardless of verification status. The submission
worker (`workers/submission`) never checked this status either — it already
just uses whatever `indexnowKey`/`indexnowKeyLocation` the domain record
has — so this change required no worker-side code, only removing the
API-level pre-check.

The web app reflects this: the submit page lists every domain, not just
verified ones (labeling unverified ones and noting the submission may still
fail), and the project page's "Submit URLs" action is gated on having *any*
domain, not a verified one.

`SubmissionFailureReason.DOMAIN_NOT_VERIFIED` stays in the enum — nothing
produces it today, but it remains available for a future, more precise
mapping of IndexNow's own 403 (bad/missing key) response, which is a
reasonable follow-up and not required for this change.

## Consequences

- A submission can now reach `FAILED` for a domain that looked "fine" at
  submit time (verification never attempted, or `PENDING`) — this is
  expected, not a bug: it's IndexNow's real rejection surfacing where it
  always eventually would have, just one step later than an upfront block
  would have caught it.
- Domain verification is now genuinely optional/advisory from the
  submission pipeline's point of view — still useful (it's the fastest way
  to *know* a domain will actually work, and still what confirms ownership
  for the dashboard), but no longer a hard gate.
- `apps/api/src/modules/submissions/submissions.service.spec.ts`'s test
  asserting an upfront `DOMAIN_NOT_VERIFIED` rejection was replaced with one
  asserting the opposite: an unverified domain's submission is accepted and
  queued the same as a verified one.
