# FoxIndex

Multi-tenant SaaS for fast, legitimate URL discovery/indexing submission
(via IndexNow), domain verification, and index-status monitoring. See
[docs/architecture.md](./docs/architecture.md) for what's actually built
and how it fits together.

## Running locally — no Docker required

Everything talks to managed services via plain connection strings
(`DATABASE_URL` for Neon Postgres, `REDIS_URL` for Upstash Redis), so
nothing here needs a container. Copy `.env.example` to `.env` and fill in
real values first.

**First time (or after pulling schema changes):**

```sh
pnpm install
pnpm turbo run build   # packages resolve to dist/ — apps/workers won't start without this
pnpm db:migrate
```

**Every time you want to run it:**

```sh
# Terminal 1 — catches verification/reset emails Better Auth sends.
# Web UI at http://localhost:1080
pnpm --filter @foxindex/e2e exec maildev

# Terminal 2 — API, web app, and both workers together
pnpm dev
```

- Web app: http://localhost:3000
- API: http://localhost:3001 (OpenAPI docs at `/api/docs`)
- MailDev inbox: http://localhost:1080 — sign up, then open the
  verification email here and click the link (Better Auth requires a
  verified email before login)

`pnpm dev` (`turbo run dev`) does **not** rebuild `packages/*` on change —
it only watches `apps/api`, `apps/web`, and the two workers' own source.
If you edit a package (e.g. `packages/database`), rebuild it before the
change is visible: `pnpm --filter @foxindex/<package> build`.

**Optional — actually run Docker instead:** `infrastructure/docker/` has
the full compose stack (local Postgres/Redis/MailDev containers, or point
it at Neon/Upstash the same way — see
`docker-compose.staging.example.yml`). It's written and structurally
validated but has never been run in this development environment (no
Docker daemon available here — see
[docs/architecture.md](./docs/architecture.md#whats-live-verified-vs-what-isnt)).

## Testing

```sh
pnpm turbo run lint typecheck test   # unit tests, no external services needed
pnpm test:e2e                        # full Playwright run — boots everything itself, see tests/e2e/
```

## Docs

- [docs/architecture.md](./docs/architecture.md) — what's built, request
  flow, data model, what's live-verified vs. not
- [docs/future-modules.md](./docs/future-modules.md) /
  [docs/future-schema.md](./docs/future-schema.md) — what's deliberately
  deferred past Phase 1
- [docs/deployment.md](./docs/deployment.md) — current (non-)deployment
  state
- [docs/adr/](./docs/adr/) — why things are built the way they are
