-- Daily adherence check-in (issue #4)
-- Additive only: new tables for supplement stack config + adherence miss log,
-- plus a unique constraint on supplements so a given (day, name) is upserted.

CREATE TABLE IF NOT EXISTS "supplement_stack" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "dosage" text,
  "unit" text,
  "schedule" text,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplement_stack_name_uniq" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplement_stack_active_idx" ON "supplement_stack" ("active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adherence_misses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "miss_date" date NOT NULL,
  "category" text DEFAULT 'checkin' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "adherence_misses_date_category_uniq" UNIQUE("miss_date", "category")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adherence_misses_date_idx" ON "adherence_misses" ("miss_date");
--> statement-breakpoint
-- Unique upsert key for one-per-day-per-supplement check-in writes.
CREATE UNIQUE INDEX IF NOT EXISTS "supplements_day_name_uniq"
  ON "supplements" ((("taken_at" AT TIME ZONE 'UTC')::date), "name")
  WHERE "source" = 'checkin';
