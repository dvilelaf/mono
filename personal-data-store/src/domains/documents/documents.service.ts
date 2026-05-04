import { db } from "../../db/index.js";
import { documents, embeddings } from "./documents.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { chunkText, generateEmbedding } from "./embedding.js";

interface CreateDocumentInput {
  domain: string;
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  generateEmbeddings?: boolean;
}

export async function createDocument(input: CreateDocumentInput) {
  const [doc] = await db
    .insert(documents)
    .values({
      domain: input.domain,
      type: input.type,
      title: input.title,
      content: input.content,
      source: input.source,
      metadata: input.metadata,
    })
    .returning();

  if (input.generateEmbeddings && input.content) {
    const chunks = chunkText(input.content);
    for (let i = 0; i < chunks.length; i++) {
      const chunkTextVal = chunks[i];
      const vector = await generateEmbedding(chunkTextVal);
      await db.execute(sql`
        INSERT INTO embeddings (id, document_id, chunk_index, chunk_text, embedding, created_at)
        VALUES (gen_random_uuid(), ${doc.id}, ${i}, ${chunkTextVal}, ${sql.raw(`'[${vector.join(",")}]'::vector`)}, NOW())
      `);
    }
  }

  return doc;
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  return doc ?? null;
}

export async function queryDocuments(filters: { domain?: string; type?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.domain) conditions.push(eq(documents.domain, filters.domain));
  if (filters.type) conditions.push(eq(documents.type, filters.type));
  if (filters.from) conditions.push(gte(documents.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(documents.createdAt, new Date(filters.to)));

  return db
    .select()
    .from(documents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documents.createdAt));
}

export async function getIndexerStatus() {
  const [docs] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM documents WHERE type = 'file'
  `)) as unknown as Array<{ n: number }>;
  const [chunks] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM document_chunks
  `)) as unknown as Array<{ n: number }>;
  const [v1] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM embeddings
  `)) as unknown as Array<{ n: number }>;
  const [last] = (await db.execute(sql`
    SELECT MAX(last_indexed_at) AS ts FROM documents WHERE type = 'file'
  `)) as unknown as Array<{ ts: string | null }>;
  const [bad] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM documents WHERE type = 'file'
      AND (summary IS NULL
           OR LENGTH(summary) < 50
           OR summary LIKE '%I can see%'
           OR summary LIKE '%I misread%'
           OR summary LIKE '%Could you provide%'
           OR summary LIKE '%Let me%')
  `)) as unknown as Array<{ n: number }>;

  let indexerRunning = false;
  try {
    const { existsSync, statSync } = await import("node:fs");
    const flag = "/tmp/pds-indexer-v2.flag";
    if (existsSync(flag)) {
      const age = Date.now() - statSync(flag).mtimeMs;
      indexerRunning = age < 5 * 60 * 1000;
    }
  } catch {
    indexerRunning = false;
  }

  return {
    documents: docs?.n ?? 0,
    chunks: chunks?.n ?? 0,
    v1_embeddings: v1?.n ?? 0,
    last_indexed: last?.ts ?? null,
    bad_summaries: bad?.n ?? 0,
    indexer_running: indexerRunning,
  };
}

export async function semanticSearch(query: string, limit: number = 10, opts?: { fileOnly?: boolean }) {
  const queryVector = await generateEmbedding(query);
  const vectorLiteral = `[${queryVector.join(",")}]`;
  const fileFilter = opts?.fileOnly ? sql`WHERE d.type = 'file'` : sql``;

  const results = await db.execute(sql`
    SELECT d.id AS document_id,
           d.title, d.domain, d.type, d.summary,
           d.file_path, d.file_type, d.file_size, d.file_modified_at,
           d.metadata,
           e.chunk_text, e.chunk_index,
           e.embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)} AS distance
    FROM embeddings e
    JOIN documents d ON d.id = e.document_id
    ${fileFilter}
    ORDER BY distance ASC
    LIMIT ${limit}
  `);

  return results;
}
