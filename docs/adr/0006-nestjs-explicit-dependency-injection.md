# 0006: Explicit `@Inject()` everywhere, and explicit provider registration for guards

## Status

Accepted — the hard way, twice.

## Context

`apps/api` runs under `tsx watch` in development (fast, no separate compile
step) and under `tsc -b` + `node` in production. Both are supposed to
behave identically. They didn't, in two distinct ways, and both bugs were
invisible from reading the code or from `tsc` passing cleanly — they only
showed up by actually booting the app under `pnpm dev` and exercising a
route.

### Bug 1 — implicit-type constructor params silently `undefined` under `tsx`

`DomainsService`'s constructor originally injected `DomainsRepository` via
plain TypeScript constructor-parameter typing (`constructor(private repo:
DomainsRepository)`), relying on Nest's usual `emitDecoratorMetadata`-based
implicit resolution. This worked under `tsc -b` — the real, production
build — but the same file, run via `tsx watch` (esbuild under the hood),
left the parameter `undefined` at runtime with no boot-time warning from
Nest in this configuration. esbuild does not reliably preserve or emit the
decorator metadata Nest's implicit DI depends on; `tsc` does. Root-caused
by comparing behavior between the two build paths side by side.

### Bug 2 — `@UseGuards(ClassRef)` and `@Inject()` are different mechanisms

`SessionOrApiKeyGuard` itself injects `AuthGuard` and `ApiKeyGuard` via
explicit `@Inject(AuthGuard)` / `@Inject(ApiKeyGuard)` constructor
parameters (the fix for Bug 1, applied here too) — and still failed to
boot, with `UnknownDependenciesException`. The reason: `@UseGuards(SomeGuard)`
elsewhere in the app works via Nest's own guard-instantiation path, which
does *not* require `SomeGuard` to be a registered provider anywhere — Nest
instantiates it directly. Explicit `@Inject()`, by contrast, resolves
through Nest's DI container and *does* require the injected class to be a
registered provider in some module the injecting class can see. Using
`@UseGuards(AuthGuard)` in one controller does not make `AuthGuard`
available to `@Inject(AuthGuard)` in an unrelated service — they're
unrelated resolution paths that happen to reference the same class.

## Decision

1. Every constructor-injected parameter in `apps/api` gets an explicit
   `@Inject(Token)` — no implicit, type-only injection anywhere, even
   where it happens to work today under `tsc`. Consistency here is what
   makes the failure mode impossible to reintroduce by accident, since a
   mixed constructor (some explicit, some implicit) is exactly what
   produced Bug 1.
2. `@typescript-eslint/consistent-type-imports` is disabled entirely
   (`'off'`, not `'warn'`) for `apps/api/**/*.ts` in `eslint.config.js`.
   Its autofix rewrites a class's *value* import into a `import type`
   import whenever the class is only referenced in type position in a
   given file — which is exactly what a constructor parameter's type
   annotation looks like to the linter, even when that same class is also
   the argument to `@Inject()` two lines later. An unguarded `eslint --fix`
   converted six working value imports into `import type` this way,
   silently breaking DI in a related but distinct manner (the class
   becomes unavailable as a *value* at all, not just unresolved as a
   token).
3. Any class referenced via `@UseGuards(SomeGuard)` that is *also*
   `@Inject()`-ed somewhere else must be explicitly listed in that
   module's `providers` array (see `SubmissionsModule`, which registers
   `AuthGuard, ApiKeyGuard, SessionOrApiKeyGuard` explicitly for exactly
   this reason). `@UseGuards()` alone is never sufficient to make a guard
   class available to Nest's DI container elsewhere.

## Consequences

- Every new controller/service/guard in `apps/api` must follow both rules;
  code review (and this ADR) is the enforcement mechanism, since neither
  bug produces a lint or typecheck failure — only a runtime one, and only
  under `tsx`, not under `tsc`.
- `pnpm dev` and the production build can silently diverge in ways `pnpm
  turbo run typecheck lint build` will never catch. The only reliable way
  to know DI is wired correctly is to actually boot the app and exercise
  the route — which is exactly what caught both of these bugs, and part
  of why `tests/e2e` boots the real API (via `pnpm dev`, the same tsx
  path) rather than only unit-testing modules in isolation.
- This is scoped to `apps/api` specifically (the ESLint override is
  file-path-scoped) — packages that don't use NestJS's decorator-based DI
  don't need it and keep the normal `consistent-type-imports` rule.
