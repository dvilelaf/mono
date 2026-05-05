-- Anomaly + freshness watchdog (issue #6)
-- Additive only.

CREATE TABLE IF NOT EXISTS "watchdog_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "check_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'warning',
  "subject" text NOT NULL,
  "title" text NOT NULL,
  "detail" text,
  "fingerprint" text NOT NULL,
  "metadata" jsonb,
  "resolved" boolean NOT NULL DEFAULT false,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchdog_alerts_resolved_created_idx"
  ON "watchdog_alerts" ("resolved", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchdog_alerts_check_type_idx"
  ON "watchdog_alerts" ("check_type");
--> statement-breakpoint
-- An open (unresolved) alert is unique by fingerprint to avoid re-firing.
CREATE UNIQUE INDEX IF NOT EXISTS "watchdog_alerts_open_fingerprint_uniq"
  ON "watchdog_alerts" ("fingerprint")
  WHERE "resolved" = false;
