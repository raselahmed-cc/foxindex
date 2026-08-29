# FoxIndex

Enterprise multi-tenant SaaS for fast, legitimate URL discovery submission (IndexNow),
domain verification, and index-status monitoring.

## Phase 1 scope

This is the "walking skeleton" phase: the full request path is proven end-to-end for one
golden path — signup → organization → project → domain → verify → submit URL → IndexNow
push → status visible — with the repo/DB/module structure laid out for the platform's full
entity list. See `docs/architecture.md` for what's built vs. deferred, and
`docs/future-modules.md` / `docs/future-schema.md` for what's intentionally not built yet.

## Requirements

- Node.js >= 22
- pnpm 9.15.4 (`corepack enable` or `npm install -g pnpm@9.15.4`)
- Docker (for local Postgres/Redis/MailDev and the full compose stack) — **or**, if
  Docker/virtualization isn't available on your machine, point `DATABASE_URL`/`REDIS_URL`
  in `.env` at free-tier [Neon](https://neon.tech) (Postgres) and [Upstash](https://upstash.com)
  (Redis, use the `rediss://` TLS URL) instead — no code changes needed either way, and run
  `npx maildev` locally in place of the compose service for email testing.

## Getting started

```bash
pnpm install
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis maildev
pnpm db:migrate
pnpm dev
```

- API: http://localhost:3001/api/v1 (Swagger at `/api/v1/docs`)
- Web: http://localhost:3000
- MailDev UI (verification/reset emails in dev): http://localhost:1080

## Workspace layout

```
apps/web          Next.js dashboard
apps/api          NestJS API
workers/          BullMQ workers (submission, verification — active; crawler/sitemap/diagnostics — Phase 2 stubs)
packages/         Shared libraries (database, auth, queue, providers, validation, ssrf-fetch, config, logger, types)
infrastructure/   Docker, Terraform (Phase 2+), Cloudflare (Phase 2+)
docs/             Architecture, future modules/schema, ADRs
tests/e2e/         Playwright golden-path test
```

## Common commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/future-modules.md`](docs/future-modules.md)
- [`docs/future-schema.md`](docs/future-schema.md)
- [`docs/adr/`](docs/adr/)
