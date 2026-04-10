CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"analysis_type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text,
	"confidence" text,
	"entities" jsonb,
	"result" jsonb,
	"source_query" jsonb,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analyses_domain_type_idx" ON "analyses" USING btree ("domain","analysis_type");--> statement-breakpoint
CREATE INDEX "analyses_parent_idx" ON "analyses" USING btree ("parent_id");