ALTER TYPE "public"."payment_method_type" ADD VALUE 'paypal';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_order_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "save_method" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "provider_token" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "provider_customer_id" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "last4" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "expiry" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "account_name" text;--> statement-breakpoint
ALTER TABLE "user_payment_accounts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
-- PayPal checkout (USD). type 'gateway' because a new enum value can't be used in the transaction that adds it.
INSERT INTO "payment_methods" ("type", "label", "network", "is_manual", "gateway", "is_active", "sort_order", "instructions")
SELECT 'gateway', 'PayPal or card (USD)', 'paypal', false, 'paypal', true, 45, 'Pay with your PayPal balance or any debit/credit card. Charged in USD.'
WHERE NOT EXISTS (SELECT 1 FROM "payment_methods" WHERE "gateway" = 'paypal');
