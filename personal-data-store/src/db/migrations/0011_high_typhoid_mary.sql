CREATE TABLE "income_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"stream_type" text NOT NULL,
	"asset" text,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "income_streams_source_period_uniq" UNIQUE("source","stream_type","asset","period_start")
);
--> statement-breakpoint
CREATE INDEX "income_streams_source_idx" ON "income_streams" USING btree ("source","stream_type");--> statement-breakpoint
CREATE INDEX "income_streams_period_idx" ON "income_streams" USING btree ("period_start");