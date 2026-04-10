CREATE TABLE "yield_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"protocol" text NOT NULL,
	"chain" text NOT NULL,
	"token" text NOT NULL,
	"token_balance" numeric NOT NULL,
	"token_price" numeric NOT NULL,
	"value_usd" numeric NOT NULL,
	"apy" numeric,
	"snapshot_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "yield_positions_name_snapshot_idx" ON "yield_positions" USING btree ("name","snapshot_at");