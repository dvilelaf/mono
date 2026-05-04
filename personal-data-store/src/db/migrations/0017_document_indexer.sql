ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_path" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_size" bigint;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_hash" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_modified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "last_indexed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "summary" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='documents_file_hash_key') THEN
    ALTER TABLE "documents" ADD CONSTRAINT "documents_file_hash_key" UNIQUE ("file_hash");
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "embeddings" ALTER COLUMN "embedding" TYPE vector(768);
