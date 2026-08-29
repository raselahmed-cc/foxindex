# Deployment

**Current state: nothing is deployed anywhere, and no deploy target is
configured.** This document says what exists to deploy *from* and what's
still missing, rather than pretending a target exists — `.github/workflows/ci.yml`'s
`deploy` job is `if: false` with a comment pointing here for exactly this
reason.

## What exists

- **Docker images**: `infrastructure/docker/Dockerfile.{api,web,worker}`
  build production images for the API, the web app, and the two workers
  (the worker image takes a `WORKER_NAME` build arg to pick
  submission-vs-verification). `ci.yml`'s `docker-build` job builds all
  three (`--load`, no push) on every PR as a build-still-works check.
- **A staging compose example**: `infrastructure/docker/docker-compose.staging.example.yml`
  documents exactly what changes moving from local dev to a real
  environment — remove the local `postgres`/`redis`/`maildev` containers
  entirely (Neon, Upstash, and a real SMTP relay are external managed
  services; the constitution is explicit that these should never be
  self-hosted in containers) and repoint the same env vars at them. No
  application code or image changes either way — this is the same
  Docker-vs-no-Docker portability already exercised for local dev (see
  `docs/architecture.md`'s note on what's live-verified: the actual
  golden path has run against real Neon/Upstash from plain `pnpm dev`
  processes, just not from inside these containers, since this
  environment has no Docker daemon available).
- **A reverse proxy config**: `infrastructure/docker/Caddyfile` (local) —
  a production `Caddyfile.staging` (with a real domain and automatic
  HTTPS) is referenced by the staging compose example but doesn't exist
  yet, since there's no domain to point it at.

## What's missing before any real deploy

1. **A target to deploy to.** No cloud account, VM, or PaaS is provisioned.
   `infrastructure/terraform/` and `infrastructure/cloudflare/` are
   README placeholders, not IaC — see
   [future-modules.md](./future-modules.md#terraform--kubernetes).
2. **A container registry** to push the built images to, and the
   corresponding `push: true` + registry auth in `ci.yml`'s
   `docker-build` job (currently `push: false, load: true` — it only
   proves the image builds).
3. **A GitHub remote.** Git is local-only for this project by deliberate
   choice so far — `.github/workflows/*.yml` are written and pass the
   equivalent commands locally (`pnpm turbo run lint typecheck test
   build`), but neither workflow has ever actually executed on GitHub's
   runners, because there's no remote for GitHub Actions to run against.
4. **Real secrets** in whatever CI/CD or hosting platform is chosen —
   `BETTER_AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, SMTP credentials —
   distinct from the CI-only placeholder values in `ci.yml`'s `env:`
   block and the real (but locally-`.env`-only, never committed) Neon/
   Upstash credentials this environment develops against.
5. **Container image scanning** (Trivy/Snyk) — commented out in `ci.yml`'s
   `security-scan` job pending a registry to scan images in.

## Recommended order, when this becomes real

1. Push this repo to a GitHub remote; confirm `ci.yml` and `e2e.yml` run
   and pass on GitHub's runners (their equivalents already pass locally,
   but "the YAML is well-formed" and "it actually runs green on GitHub's
   infrastructure" are different claims — verify the second before
   trusting it).
2. Provision a target (a single small VM running the staging compose file
   is enough to start — no need for Kubernetes at this scale) and a
   container registry.
3. Wire real secrets into GitHub Actions, flip `docker-build` to push,
   and turn the `deploy` job's `if: false` into a real deploy step.
4. Enable virtualization in this environment's BIOS (or develop from a
   machine that already has it) to get local Docker Desktop working, so
   the compose stack itself — not just its equivalent processes — gets
   exercised before every deploy, not only in CI.
