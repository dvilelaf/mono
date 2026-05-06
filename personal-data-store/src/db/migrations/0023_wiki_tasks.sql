-- Wiki → action queue (issue #10)
-- Tracked tasks seeded from wiki/20-synthesis/blockers/*.md.
-- Each task may link to a goal via goal_slug; goal_id is best-effort
-- denormalisation (filled by the seed/upsert path, no FK so missing goals
-- don't block insertion).
-- Additive only.

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "source_path" text,
  "goal_slug" text,
  "goal_id" uuid,
  "status" text NOT NULL DEFAULT 'open',
  "priority" integer NOT NULL DEFAULT 3,
  "due_date" timestamp with time zone,
  "smallest_next_action" text,
  "evidence_query" jsonb,
  "notes" text,
  "completed_at" timestamp with time zone,
  "completed_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tasks_slug_uniq" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_goal_slug_idx" ON "tasks" ("goal_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_priority_idx" ON "tasks" ("priority");
