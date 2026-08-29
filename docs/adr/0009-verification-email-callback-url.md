# 0009: The signup call must pass `callbackURL`, or verification links strand the user on the API

## Status

Accepted — found by a real user clicking a real verification link.

## Context

Clicking the link in a FoxIndex verification email landed on a bare
`Cannot GET /` page at `http://localhost:3001/` — the API's own origin,
with no route at `/` — instead of anywhere in the web app.

Reading Better Auth's own installed source
(`better-auth/dist/api/routes/sign-up.mjs` and
`.../email-verification.mjs`) rather than guessing at its behavior showed
exactly why: the sign-up handler builds the verification link as
`${baseURL}/verify-email?token=...&callbackURL=${body.callbackURL ?? '/'}`
— if the client's `signUp.email(...)` call doesn't pass a `callbackURL`,
Better Auth defaults it to the literal string `/`. The `GET /verify-email`
handler, after successfully verifying, does
`if (ctx.query.callbackURL) throw ctx.redirect(ctx.query.callbackURL)` —
so it faithfully redirects to `/`, which the browser resolves against the
request's own origin (`http://localhost:3001`, since that's where the
verification link itself points, per `BETTER_AUTH_URL`) — not the web
app's origin. The API has no route at `/`, hence `Cannot GET /`.

`apps/web/src/app/(auth)/signup/page.tsx`'s original `signUp.email({
email, password, name })` call never set `callbackURL`, so every
verification email FoxIndex sent had this default, broken redirect target.

## Decision

`signUp.email(...)` now passes `callbackURL: `${window.location.origin}/login``
— `window.location.origin` rather than a hardcoded URL, so this keeps
working regardless of which port the web app actually ends up serving from
(`next dev` falls back to another port if 3000 is already taken).

`window.location.origin` also has to already be in Better Auth's
`trustedOrigins` list ([ADR 0006](./0006-nestjs-explicit-dependency-injection.md)'s
neighbor bug, fixed earlier as part of the CORS work) — the `/verify-email`
route runs an `originCheck` middleware against the `callbackURL` query
param specifically, not just against CORS.

## Consequences

- Verified live end-to-end outside any test harness: a direct sign-up POST
  with `callbackURL` set produced a verification email whose link, when
  followed, returned `302` with `Location: http://localhost:3000/login`
  and set the session cookie (auto-sign-in-after-verification working) —
  not the API's bare root.
- `tests/e2e/golden-path.spec.ts`'s `page.goto(verifyLink)` step never
  asserted on where that navigation landed, only that the underlying GET
  request happened (which is all that's needed to mark the email
  verified) — so this bug was invisible to the E2e suite even after it
  started passing. A real user's browser, which actually renders whatever
  page a redirect lands on, is what caught it.
- Any other place that ever calls `signUp.email(...)` (there's only the
  one, today) needs the same `callbackURL`. A "forgot password" flow, if
  built later, will need the equivalent treatment for `sendResetPassword`'s
  own link for the same reason.
