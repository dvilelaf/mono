CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration" numeric,
	"distance" numeric,
	"distance_unit" text,
	"active_energy" numeric,
	"active_energy_unit" text,
	"avg_heart_rate" numeric,
	"max_heart_rate" numeric,
	"location" text,
	"is_indoor" boolean,
	"metadata" jsonb,
	"route" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_external_id_uniq" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE INDEX "workouts_name_started_idx" ON "workouts" USING btree ("name","started_at");