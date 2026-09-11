CREATE TYPE "public"."credit_ledger_reason" AS ENUM('SIGNUP_BONUS', 'MANUAL_GRANT', 'SUBMISSION_DEDUCTION');--> statement-breakpoint
ALTER TYPE "public"."submission_failure_reason" ADD VALUE 'INSUFFICIENT_CREDITS' BEFORE 'PROVIDER_ERROR';--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "credit_ledger_reason" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "credit_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_organization_id_created_at_idx" ON "credit_ledger" USING btree ("organization_id","created_at");