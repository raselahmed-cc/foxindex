-- Custom SQL migration file, put your code below! --

-- docs/adr/0013: flatten organizations/domains away, phase 2 of 2. Run only
-- after 0002 has been applied AND migrate-to-flat-model.ts has backfilled
-- projects.user_id, projects.indexnow_key, url_submissions.user_id,
-- credit_ledger.user_id, audit_logs.user_id, and api_keys.project_id (the 2
-- pre-existing org-wide keys) for every existing row — every NOT NULL below
-- would otherwise fail against real data.

-- projects: organization_id -> user_id
ALTER TABLE "projects" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "indexnow_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "projects_org_slug_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "organization_id";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_slug_unique" ON "projects" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_indexnow_key_unique" ON "projects" USING btree ("indexnow_key");--> statement-breakpoint

-- urls: drop organization_id and domain_id entirely (project_id is enough)
DROP INDEX IF EXISTS "urls_domain_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "urls_organization_id_idx";--> statement-breakpoint
ALTER TABLE "urls" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "urls" DROP COLUMN "domain_id";--> statement-breakpoint

-- url_submissions: organization_id -> user_id (denormalized project owner)
ALTER TABLE "url_submissions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "url_submissions" ADD CONSTRAINT "url_submissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "url_submissions_org_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "url_submissions" DROP COLUMN "organization_id";--> statement-breakpoint
CREATE UNIQUE INDEX "url_submissions_user_idempotency_key_unique" ON "url_submissions" USING btree ("user_id","idempotency_key") WHERE "url_submissions"."idempotency_key" IS NOT NULL;--> statement-breakpoint

-- credit_ledger: organization_id -> user_id
ALTER TABLE "credit_ledger" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "credit_ledger_organization_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "credit_ledger" DROP COLUMN "organization_id";--> statement-breakpoint
CREATE INDEX "credit_ledger_user_id_created_at_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint

-- audit_logs: organization_id -> user_id
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "audit_logs_organization_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "audit_logs" DROP COLUMN "organization_id";--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint

-- api_keys: project_id becomes required, organization_id dropped
ALTER TABLE "api_keys" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "api_keys_organization_id_idx";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "organization_id";--> statement-breakpoint
CREATE INDEX "api_keys_project_id_idx" ON "api_keys" USING btree ("project_id");--> statement-breakpoint

-- Drop the old tables — children (FK to domains/organizations) before parents.
DROP TABLE IF EXISTS "domain_verifications";--> statement-breakpoint
DROP TABLE IF EXISTS "domains";--> statement-breakpoint
DROP TABLE IF EXISTS "organization_members";--> statement-breakpoint
DROP TABLE IF EXISTS "organizations";--> statement-breakpoint

-- Drop the enum types that only existed for the removed tables/columns.
DROP TYPE IF EXISTS "public"."role";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."domain_verification_method";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."domain_verification_status";
