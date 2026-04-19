CREATE TABLE "film_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text,
	"year_released" integer,
	"year_watched" integer,
	"date_watched" date,
	"body" text,
	"context" text,
	"rating" numeric NOT NULL,
	"elo_score" numeric DEFAULT '1500' NOT NULL,
	"elo_matches" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"external_ids" jsonb,
	"tags" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "film_reviews_status_idx" ON "film_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "film_reviews_elo_idx" ON "film_reviews" USING btree ("elo_score");