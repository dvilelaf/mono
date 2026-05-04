INSERT INTO "documents" ("id", "domain", "type", "title", "content", "source", "metadata", "created_at", "updated_at")
SELECT
  "id",
  "domain",
  'analysis',
  "title",
  "content",
  "source",
  jsonb_strip_nulls(jsonb_build_object(
    'analysisType', "analysis_type",
    'summary', "summary",
    'confidence', "confidence",
    'entities', "entities",
    'result', "result",
    'sourceQuery', "source_query",
    'parentId', "parent_id"
  )),
  "created_at",
  "updated_at"
FROM "analyses"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
DROP TABLE "analyses";--> statement-breakpoint
DROP TABLE "photos";