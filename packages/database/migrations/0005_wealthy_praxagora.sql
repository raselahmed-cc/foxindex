ALTER TABLE "tickets" ADD COLUMN "last_sender_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "client_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "staff_read_at" timestamp with time zone;