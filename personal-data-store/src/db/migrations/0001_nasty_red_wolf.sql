CREATE TABLE "health_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"metric_type" text NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_type" text,
	"foods" jsonb,
	"calories" numeric,
	"protein" numeric,
	"carbs" numeric,
	"fat" numeric,
	"recorded_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dosage" text,
	"unit" text,
	"taken_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "health_metrics_type_recorded_idx" ON "health_metrics" USING btree ("metric_type","recorded_at");--> statement-breakpoint
CREATE INDEX "health_metrics_source_recorded_idx" ON "health_metrics" USING btree ("source","recorded_at");