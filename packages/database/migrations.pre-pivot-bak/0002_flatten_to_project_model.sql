-- Custom SQL migration file, put your code below! --

-- docs/adr/0013: flatten organizations/domains away. Phase 1 of 2 —
-- additive only (new nullable columns + new table), so existing rows are
-- never touched here. A one-off backfill script
-- (packages/database/src/migrate-to-flat-model.ts) runs between this
-- migration and 0003, which makes these columns NOT NULL and drops the
-- old organization/domain tables and columns. Hand-written rather than
-- `drizzle-kit generate`: that command needs an interactive TTY to resolve
-- table-rename ambiguity (organizations/domains removed, provider_settings
-- added, in the same schema diff), which isn't available in this session's
-- shell — see the note in migrate-to-flat-model.ts for what this means for
-- the next `db:generate` run.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'USER';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "credit_balance" integer DEFAULT 0;--> statement-breakpoint

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "indexnow_key" varchar(128);--> statement-breakpoint

ALTER TABLE "url_submissions" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "submission_provider" DEFAULT 'INDEXNOW' NOT NULL,
	"api_base_url" varchar(500),
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "provider_settings" ADD CONSTRAINT "provider_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_settings_provider_unique" ON "provider_settings" USING btree ("provider");
