CREATE TABLE "genomics_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"profile_type" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genomics_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"rsid" text,
	"chromosome" text,
	"position" integer,
	"genotype" text,
	"gene" text,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "genomics_variants" ADD CONSTRAINT "genomics_variants_profile_id_genomics_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."genomics_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "genomics_variants_rsid_idx" ON "genomics_variants" USING btree ("rsid");--> statement-breakpoint
CREATE INDEX "genomics_variants_gene_idx" ON "genomics_variants" USING btree ("gene");