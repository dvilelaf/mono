CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"frequency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"confidence" text NOT NULL,
	"first_seen" date NOT NULL,
	"last_seen" date NOT NULL,
	"next_expected" date,
	"category" text,
	"metadata" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_desc_currency_uniq" UNIQUE("description","currency")
);
--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");