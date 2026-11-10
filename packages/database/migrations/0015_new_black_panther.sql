ALTER TABLE "sites" ADD COLUMN "indexnow_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "indexnow_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "indexnow_last_error" text;