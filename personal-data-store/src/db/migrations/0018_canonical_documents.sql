ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "canonical_for" text[];--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_canonical_for_gin_idx" ON "documents" USING GIN ("canonical_for");
