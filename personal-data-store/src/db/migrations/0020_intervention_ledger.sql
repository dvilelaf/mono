CREATE TABLE IF NOT EXISTS "interventions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "domain" text NOT NULL,
  "type" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "start_date" timestamp with time zone NOT NULL,
  "end_date" timestamp with time zone,
  "hypothesis" text,
  "affected_metrics" text[],
  "affected_goals" text[],
  "metric_source" text,
  "protocol" text,
  "window_days" integer DEFAULT 28 NOT NULL,
  "canonical_topics" text[],
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "interventions_slug_uniq" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interventions_domain_idx" ON "interventions" ("domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interventions_status_idx" ON "interventions" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intervention_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intervention_id" uuid NOT NULL REFERENCES "interventions"("id") ON DELETE CASCADE,
  "metric_name" text NOT NULL,
  "metric_source" text,
  "value_before" numeric,
  "value_after" numeric,
  "delta" numeric,
  "delta_pct" numeric,
  "n_before" integer,
  "n_after" integer,
  "window_days" integer NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intervention_observations_intervention_observed_idx" ON "intervention_observations" ("intervention_id", "observed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intervention_observations_metric_idx" ON "intervention_observations" ("metric_name");
