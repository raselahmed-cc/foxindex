# 0012: Submitting a URL no longer requires pre-registering its domain

> **Superseded by [ADR 0013](./0013-flatten-to-project-single-indexnow-key.md).**
> This ADR's auto-created domains were themselves removed shortly after —
> a project now has exactly one IndexNow key, used for every URL, and
> there is no `domains` table left to auto-create rows in. Kept as
> historical record of the intermediate step.

## Status

Accepted.

## Context

`POST /projects/:id/submissions` required a `domainId` for the whole
request — every URL in the batch had to belong to that one, already-added
domain (`urlBelongsToHostname` rejected anything else). A user had to visit
"Add domain," wait for it to appear, then come back to submit. Feedback
from actually using the product: this is friction for the common case of
"I just want to push this URL," especially for someone submitting URLs
across several different sites who'd otherwise have to add every domain
up front before submitting anything.

Two designs were possible here: (a) let one batch span multiple domains but
still require each to be pre-registered first (reject a URL whose hostname
has no existing domain, with a "add this domain first" message), or (b) auto-
create a domain for any hostname a submission ever mentions, the first time
it's seen. Confirmed with the user: (b).

## Decision

`SubmissionsService.submitUrls()` no longer takes a `domainId` at all —
`submitUrlsSchema` dropped the field. For each URL, its own hostname
(`new URL(normalizedUrl).hostname`) resolves a domain via
`DomainsService.findOrCreateByHostname()`: an existing domain for that
`(project, hostname)` pair if one exists, or a freshly-created one
(a generated IndexNow key, `PENDING` verification) if not. A single batch
can freely span multiple domains, each resolved independently — there is no
longer one "the domain" for a whole request.

Auto-created domains are ordinary domain rows in every other respect: they
show up on the project's domain list, can be verified the normal way
(host the key file, click Verify), and — per
[ADR 0010](./0010-domain-verification-not-required-to-submit.md) — being
unverified never blocked submission anyway. Nothing about IndexNow's own
authorization check changes: it still independently looks for the key file
at the domain, regardless of whether FoxIndex created that domain row
automatically or a human clicked "Add domain" first.

`DomainsRepository.findOrCreate()` uses the same
`onConflictDoNothing`-then-refetch shape as `UrlsRepository.upsert()` — two
concurrent requests racing to auto-create the same brand-new hostname hit
the `(project_id, hostname)` unique constraint, not an application-level
check-then-insert race.

## Consequences

- The web submit page has no domain picker anymore — just a URL list. The
  project page's "Submit URLs" action is no longer gated on having any
  domain at all (previously gated on `hasAnyDomain`).
- `AcceptedSubmission` gained a `hostname` field (there's no single
  request-level domain left to infer it from), shown per-URL in the submit
  result so a multi-domain batch's outcome is legible.
- The audit log's `url.submitted` entry now records `domainIds` (plural,
  every domain touched in the batch) instead of a single `domainId`.
- A batch that touches N distinct new hostnames now creates N domain rows,
  with no cap — this is an accepted tradeoff, not a limitation to fix later;
  see [future-modules.md](../future-modules.md) if abuse at that surface
  ever becomes a real problem worth a rate limit of its own.
- `urlBelongsToHostname` (`packages/validation`) had exactly one caller —
  the removed per-request hostname check — so it was deleted along with its
  own test rather than left as an unused export nothing else calls.
