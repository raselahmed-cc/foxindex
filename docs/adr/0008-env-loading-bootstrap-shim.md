# 0008: `.env` loading needs a dependency-free bootstrap shim, not source position

## Status

Accepted — found by actually running `pnpm dev` outside the E2E harness.

## Context

`apps/api/src/main.ts` originally loaded `.env` as its first statement,
textually before every other `import` in the file — the same pattern
`workers/submission` and `workers/verification` already used successfully.
It looked right, typechecked, and even passed a full Playwright E2E run.

It was still broken. Running the API via plain `pnpm dev` (no Playwright
involved) failed every time with `DATABASE_URL`/`REDIS_URL`/etc. all
`undefined`, even though a debug log placed right after the dotenv call
confirmed `process.env.DATABASE_URL` genuinely was set at that point in the
file.

The reason: esbuild (what `tsx` uses) hoists every `import` in a file above
regular statements in its compiled CommonJS output — unlike `tsc`, which
preserves source order exactly as written. `import { AppModule } from
'./app.module'` was textually *after* the dotenv call, but got hoisted
above it. `AppModule`'s `@Module({...})` decorator evaluates
`ConfigModule.forRoot({ validate: () => loadApiEnv() })` as a synchronous
side effect the moment `app.module.ts` is required — not later, when
`NestFactory.create()` "starts" the app — and that `validate()` call reads
`process.env` before the dotenv call (a *non-import* statement, unaffected
by hoisting) ever got a chance to run. `app.module.ts` also transitively
pulls in `@foxindex/auth`, whose own top-level `betterAuth(...)` call has
the identical problem.

**Why the workers never hit this**: their equivalent code
(`createDbClient({ connectionString: process.env.DATABASE_URL })`) is
written directly in their own `main.ts`, as a *regular statement* positioned
after the dotenv call — regular statements keep their relative order under
esbuild; only `import` declarations get hoisted. Nothing the workers import
has a comparable eager, env-reading side effect at module-evaluation time.
This made the "dotenv call first" pattern look universally safe when it was
actually only accidentally safe for files that happen not to import
anything like `@foxindex/auth` or `AppModule`.

**Why the E2E suite didn't catch it**: `tests/e2e/playwright.config.ts`
loads `.env` itself, in the Playwright *parent* process, before spawning
the API as a `webServer` child — and Playwright passes `{...process.env,
...entry.env}` to that child. The API inherited already-populated env vars
from its parent before a single line of its own code ran, so main.ts's own
(broken) dotenv call never mattered in that environment. The bug was real
and shipped for a while; only running the API standalone, the way a
developer actually would without Docker, exposed it.

## Decision

`apps/api/src/bootstrap.ts` is a new, minimal entry point with exactly two
statements: `process.loadEnvFile(...)` (Node's native, built-in `.env`
loader — no `dotenv` dependency) wrapped in a `try/catch` (real deploys and
CI provide env vars directly with no `.env` file to find), then
`require('./main')`. `apps/api/package.json`'s `dev`/`start` scripts point
at `bootstrap.ts`/`dist/bootstrap.js`, not `main.ts`/`dist/main.js`.

This works because `process.loadEnvFile` is a plain call on the global
`process` object — not an import, nothing for esbuild to hoist — and
`require('./main')` is an ordinary function call, evaluated exactly where
it's written. There is nothing else in the file for esbuild to reorder
around it, so nothing `main.ts` imports, however many layers deep, however
many of them read `process.env` at their own import time, can possibly run
before this file's two lines do.

`main.ts` itself no longer loads `.env` at all — that's `bootstrap.ts`'s
entire job now.

## Consequences

- Any future app or worker gaining an eager, env-reading import (the way
  `apps/api` gained one through `@foxindex/auth`) needs this same
  dependency-free-bootstrap-shim pattern, not a "load env first in this
  same file" pattern — the latter is only safe by coincidence, and that
  coincidence is invisible until something breaks it. `workers/submission`
  and `workers/verification` don't need this today (verified: both
  boot correctly through plain `pnpm dev`, not just through Playwright's
  env-inheriting harness), but they'd be one poorly-timed new import away
  from the exact same failure with no compiler or linter warning.
- `tsc -b` (the production build) still compiles `bootstrap.ts` fine and
  preserves its two-statement order regardless — this fix doesn't depend on
  `tsc`'s different hoisting behavior the way the original bug's "safe
  under tsc, broken under tsx" pattern did. It's correct under both.
- A test environment that pre-populates `process.env` before spawning the
  app under test (Playwright's `webServer`, most CI systems) can mask this
  entire class of bug. The only environment that actually exercises
  "does this app boot on its own, from nothing but a `.env` file" is
  running it that way directly — which is now part of
  [README.md](../../README.md)'s local dev instructions specifically
  because this bug shipped past everything else that had been run before
  it.
