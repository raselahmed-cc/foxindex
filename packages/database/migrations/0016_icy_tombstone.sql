ALTER TABLE "sites" ADD COLUMN "gsc_property" text;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "index_status" "index_check_status";--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "index_coverage" text;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "last_crawled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "index_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "next_index_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "index_check_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "index_note" text;--> statement-breakpoint
CREATE INDEX "urls_next_index_check_idx" ON "urls" USING btree ("next_index_check_at");