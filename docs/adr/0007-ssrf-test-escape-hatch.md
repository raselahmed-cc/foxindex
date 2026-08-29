# 0007: A test-only SSRF escape hatch, gated by an env var never set in production

## Status

Accepted.

## Context

`packages/ssrf-fetch`'s `safeFetch()` resolves DNS itself and rejects any
result in a private/loopback/link-local/metadata IP range (127.0.0.0/8,
10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 100.64.0.0/10,
and IPv6 equivalents) — this is the whole point of the module, and it must
never be weakened for real traffic. But two things legitimately need to
reach a loopback address through it:

- `tests/e2e`'s golden-path spec hosts a domain's IndexNow key file on a
  local fixture server (`127.0.0.1:4011`) rather than a real, publicly
  resolvable domain, since the test doesn't control real DNS.
- Any future local development or CI scenario that needs to verify a
  domain against something other than a real public host.

Without some sanctioned way through the block, either the SSRF protection
gets weakened generally (unacceptable — it's the actual security boundary
here) or domain verification simply cannot be tested end-to-end at all.

## Decision

`packages/ssrf-fetch/src/ip-blocklist.ts` reads
`process.env.SSRF_FETCH_ALLOW_PRIVATE === 'true'` **once, at module load
time**, and skips the private-range check entirely when set. It is:

- Off by default, and never set in `.env.example`'s documented defaults
  for the API or the submission worker.
- Only ever set for the verification worker's process environment, and
  only by `tests/e2e/playwright.config.ts`'s own `webServer` entry for
  that worker — never in `docker-compose.dev.yml`, never in the staging
  compose example, never in `ci.yml`'s non-E2E jobs.
- Read at module load, not per-request — so it cannot be toggled by
  anything in a request itself; only the process's own startup
  environment controls it.

## Consequences

- Domain verification's actual async, SSRF-safe worker code path — not a
  mock of it — is what `tests/e2e` exercises. The alternative (mocking
  `safeFetch` entirely in the E2E environment) would mean the test never
  actually proves the verification worker's real fetch/compare/persist
  logic works.
- The flag's name and the fact that it's read once at module load (rather
  than per-call) are both deliberate: it makes "is this environment
  running with SSRF protection weakened" a single, auditable fact about
  how the process was started, not something that could vary request to
  request or be influenced by anything a caller sends.
- Anyone adding a new place that constructs a `docker-compose*.yml` file,
  a CI job, or a deploy config must not set this variable — the review
  checklist for touching SSRF-adjacent code should include grepping for
  `SSRF_FETCH_ALLOW_PRIVATE` outside `tests/e2e/`.
