CREATE TABLE "submission_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text DEFAULT 'paste' NOT NULL,
	"site_id" uuid,
	"engines" text[] DEFAULT '{}' NOT NULL,
	"url_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"priority" boolean DEFAULT false NOT NULL,
	"recheck_until_indexed" boolean DEFAULT true NOT NULL,
	"notify_when_done" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "url_submissions" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "submission_batches" ADD CONSTRAINT "submission_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_batches" ADD CONSTRAINT "submission_batches_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_batches_user_created_idx" ON "submission_batches" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "url_submissions" ADD CONSTRAINT "url_submissions_batch_id_submission_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."submission_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "url_submissions_batch_id_idx" ON "url_submissions" USING btree ("batch_id");