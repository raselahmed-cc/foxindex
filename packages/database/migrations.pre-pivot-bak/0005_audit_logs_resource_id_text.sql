-- Custom SQL migration file, put your code below! --

-- audit_logs.resource_id was uuid, but a resource can also be a user
-- (Better Auth's own opaque string id, not a uuid) — the admin module's
-- credits.granted entries surfaced this the first time it was actually
-- exercised live. text holds every existing uuid value unchanged (implicit
-- cast) and future non-uuid ids equally well.
ALTER TABLE "audit_logs" ALTER COLUMN "resource_id" SET DATA TYPE text;
