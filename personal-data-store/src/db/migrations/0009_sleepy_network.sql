CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text,
	"date" timestamp with time zone,
	"latitude" double precision,
	"longitude" double precision,
	"place_name" text,
	"city" text,
	"country" text,
	"is_photo" boolean DEFAULT true NOT NULL,
	"is_video" boolean DEFAULT false NOT NULL,
	"persons" jsonb,
	"labels" jsonb,
	"albums" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_filename_uniq" UNIQUE("filename")
);
--> statement-breakpoint
CREATE INDEX "photos_date_idx" ON "photos" USING btree ("date");--> statement-breakpoint
CREATE INDEX "photos_place_idx" ON "photos" USING btree ("city","country");