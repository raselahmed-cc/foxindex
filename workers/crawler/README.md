# Crawler worker (Phase 2+)

Not implemented — this is a stub directory, not a pnpm workspace package (deliberately
excluded from `pnpm-workspace.yaml`'s globs to avoid empty-package CI noise).

Intended scope: crawls a submitted URL to produce indexability diagnostics
(constitution's core capability list) — robots.txt, meta robots, canonical tags,
HTTP status/redirect chains, structured data validity, mobile-friendliness signals.
Would consume `packages/ssrf-fetch` directly (the same SSRF-safe fetch the
verification worker uses) rather than duplicating that logic, and would push results
into a new `index_checks` table (see `docs/future-schema.md`).
