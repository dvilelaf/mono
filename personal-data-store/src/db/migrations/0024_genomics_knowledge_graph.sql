-- Genomics knowledge graph (issue #13)
-- Typed graph: variant → constraint → intervention → metric → goal.
-- Nodes are typed by `node_type`; edges carry a `relation` string and
-- optional evidence/confidence/payload. Slugs are unique within a node
-- type so curators can reference nodes by stable identifiers (matching
-- existing intervention/goal slugs where applicable).
-- Additive only.

CREATE TABLE IF NOT EXISTS "graph_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "node_type" text NOT NULL,
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "graph_nodes_type_slug_uniq" UNIQUE("node_type", "slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_nodes_type_idx" ON "graph_nodes" ("node_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_nodes_slug_idx" ON "graph_nodes" ("slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "graph_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_node_id" uuid NOT NULL REFERENCES "graph_nodes"("id") ON DELETE CASCADE,
  "to_node_id" uuid NOT NULL REFERENCES "graph_nodes"("id") ON DELETE CASCADE,
  "relation" text NOT NULL,
  "evidence" text,
  "confidence" numeric,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "graph_edges_from_to_relation_uniq" UNIQUE("from_node_id", "to_node_id", "relation")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edges_from_idx" ON "graph_edges" ("from_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edges_to_idx" ON "graph_edges" ("to_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edges_relation_idx" ON "graph_edges" ("relation");
