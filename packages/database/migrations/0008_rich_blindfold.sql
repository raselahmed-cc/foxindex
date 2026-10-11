ALTER TABLE "submission_batches" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
CREATE INDEX "submission_batches_api_key_idx" ON "submission_batches" USING btree ("api_key_id","created_at");