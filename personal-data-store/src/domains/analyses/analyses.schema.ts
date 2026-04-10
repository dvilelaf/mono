import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain").notNull(),
    analysisType: text("analysis_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content"),
    confidence: text("confidence"),
    entities: jsonb("entities"),
    result: jsonb("result"),
    sourceQuery: jsonb("source_query"),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analyses_domain_type_idx").on(table.domain, table.analysisType),
    index("analyses_parent_idx").on(table.parentId),
  ]
);
