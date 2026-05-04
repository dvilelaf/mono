import { config } from "../src/config.js";
import postgres from "postgres";

const sql = postgres(config.databaseUrl);

const DIM = 2560;

const statements = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    text TEXT NOT NULL,
    embedding vector(${DIM}),
    tsv tsvector,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON document_chunks USING GIN(tsv)`,
  // ivfflat doesn't support >2000 dims natively; use hnsw if available, else fall back to no ANN index
];

async function main() {
  for (const stmt of statements) {
    console.log("Executing:", stmt.slice(0, 80).replace(/\s+/g, " "));
    await sql.unsafe(stmt);
  }
  // Try hnsw first (handles higher dims), then ivfflat as fallback
  try {
    await sql.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops)`,
    );
    console.log("Created hnsw embedding index");
  } catch (e: any) {
    console.warn("hnsw failed:", e.message);
    try {
      await sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
      );
      console.log("Created ivfflat embedding index");
    } catch (e2: any) {
      console.warn("ivfflat also failed (likely dim>2000); skipping ANN index. Will use exact search:", e2.message);
    }
  }

  // Add unique constraint on document content_hash if not present
  await sql.unsafe(
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash TEXT`,
  );
  await sql.unsafe(
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_path TEXT`,
  );
  await sql.unsafe(
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT`,
  );
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash) WHERE content_hash IS NOT NULL`,
  );

  console.log("Migration complete");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
