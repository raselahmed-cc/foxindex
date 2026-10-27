CREATE TABLE "visitor_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"staff_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"page" text,
	"ip" text,
	"user_agent" text,
	"last_sender" text DEFAULT 'visitor' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staff_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_chats_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "visitor_chat_messages" ADD CONSTRAINT "visitor_chat_messages_chat_id_visitor_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."visitor_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_chat_messages" ADD CONSTRAINT "visitor_chat_messages_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_chats" ADD CONSTRAINT "visitor_chats_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitor_chat_messages_chat_idx" ON "visitor_chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "visitor_chats_status_last_idx" ON "visitor_chats" USING btree ("status","last_message_at");