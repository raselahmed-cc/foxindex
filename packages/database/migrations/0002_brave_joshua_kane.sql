ALTER TYPE "public"."provider_kind" ADD VALUE 'external_api';--> statement-breakpoint
ALTER TYPE "public"."provider_kind" ADD VALUE 'search_console_sitemap';--> statement-breakpoint
CREATE SEQUENCE "public"."payment_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 2000 CACHE 1;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "max_clients" integer;--> statement-breakpoint
ALTER TABLE "credit_packs" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "internal_note" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "key_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "key_last4" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "site_id" uuid;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "monthly_credit_cap" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "ip_allowlist" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;