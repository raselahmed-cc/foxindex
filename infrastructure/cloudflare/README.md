# Cloudflare (Phase 2+)

Not configured in Phase 1 — there's no publicly deployed instance yet for it to sit
in front of. Per constitution §3's architecture, Cloudflare sits in front of Caddy
in production for DNS, TLS/edge termination, and edge-level rate limiting (the
outermost tier of constitution §13's multi-level rate limiting — API/organization/
project/domain-level limiting is already implemented in apps/api; Cloudflare is the
tier above that, applied to all traffic before it reaches Caddy).

When this is configured, it should be additive: DNS records pointing at wherever
Caddy is deployed, plus edge rules — not a replacement for anything in
`infrastructure/docker/` or the application's own guards.
