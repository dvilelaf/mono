CREATE TABLE IF NOT EXISTS "goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "domain" text NOT NULL,
  "metric_source" jsonb NOT NULL,
  "target_value" numeric,
  "target_range_low" numeric,
  "target_range_high" numeric,
  "target_direction" text NOT NULL,
  "target_date" timestamp with time zone,
  "current_value" numeric,
  "previous_value" numeric,
  "current_value_at" timestamp with time zone,
  "status" text DEFAULT 'unknown' NOT NULL,
  "eta" timestamp with time zone,
  "priority" integer DEFAULT 3 NOT NULL,
  "canonical_topics" text[],
  "unit" text,
  "notes" text,
  "narrative_doc_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goals_slug_uniq" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_domain_idx" ON "goals" ("domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_status_idx" ON "goals" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goal_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goal_id" uuid NOT NULL REFERENCES "goals"("id") ON DELETE CASCADE,
  "observed_at" timestamp with time zone NOT NULL,
  "observed_value" numeric NOT NULL,
  "delta_from_previous" numeric,
  "trajectory" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_observations_goal_observed_idx" ON "goal_observations" ("goal_id", "observed_at");
