import { pgTable, uuid, text, integer, bigint, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  type: text("type"),
  title: text("title"),
  content: text("content"),
  source: text("source"),
  metadata: jsonb("metadata"),
  filePath: text("file_path"),
  fileType: text("file_type"),
  fileSize: bigint("file_size", { mode: "number" }),
  fileHash: text("file_hash"),
  fileModifiedAt: timestamp("file_modified_at", { withTimezone: true }),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  status: text("status").default("active"),
  summary: text("summary"),
  canonicalFor: text("canonical_for").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    // embedding column is VECTOR(768) — handled via raw SQL migration
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("embeddings_document_idx").on(table.documentId)]
);
