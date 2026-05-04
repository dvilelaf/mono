import { db } from "../../db/index.js";
import { documents, embeddings } from "./documents.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { generateEmbedding } from "./embedding.js";
import { chunkAndEmbed } from "./chunk-and-embed.js";

interface CreateDocumentInput {
  domain: string;
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  canonicalFor?: string[];
  /** @deprecated v2 chunk-level embeddings are always generated when content is present. */
  generateEmbeddings?: boolean;
}

interface UpdateDocumentInput {
  domain?: string;
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  canonicalFor?: string[];
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
      canonicalFor: input.canonicalFor,
    })
    .returning();

  if (input.content && input.content.trim()) {
    try {
      await chunkAndEmbed(doc.id, input.content);
    } catch (err) {
      console.error(`[documents] chunkAndEmbed failed for ${doc.id}:`, (err as Error).message);
    }
  }

  return doc;
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  return doc ?? null;
}

export async function updateDocument(id: string, input: UpdateDocumentInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.domain !== undefined) updates.domain = input.domain;
  if (input.type !== undefined) updates.type = input.type;
  if (input.title !== undefined) updates.title = input.title;
  if (input.content !== undefined) updates.content = input.content;
  if (input.source !== undefined) updates.source = input.source;
  if (input.metadata !== undefined) updates.metadata = input.metadata;
  if (input.canonicalFor !== undefined) updates.canonicalFor = input.canonicalFor;

  const [doc] = await db
    .update(documents)
    .set(updates)
    .where(eq(documents.id, id))
    .returning();

  if (doc && input.content !== undefined && input.content.trim()) {
    try {
      await chunkAndEmbed(doc.id, input.content);
    } catch (err) {
      console.error(`[documents] chunkAndEmbed failed for ${doc.id}:`, (err as Error).message);
    }
  }

  return doc ?? null;
}

export async function deleteDocument(id: string) {
  await db.execute(sql`DELETE FROM document_chunks WHERE document_id = ${id}`);
  await db.delete(embeddings).where(eq(embeddings.documentId, id));
  await db.delete(documents).where(eq(documents.id, id));
}

export async function queryDocuments(filters: {
  domain?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (filters.domain) conditions.push(eq(documents.domain, filters.domain));
  if (filters.type) conditions.push(eq(documents.type, filters.type));
  if (filters.from) conditions.push(gte(documents.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(documents.createdAt, new Date(filters.to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const base = db.select().from(documents).where(where).orderBy(desc(documents.createdAt));
  if (filters.limit !== undefined && filters.offset !== undefined) {
    return base.limit(filters.limit).offset(filters.offset);
  }
  if (filters.limit !== undefined) return base.limit(filters.limit);
  if (filters.offset !== undefined) return base.offset(filters.offset);
  return base;
}

export async function countDocuments(filters: {
  domain?: string;
  type?: string;
  from?: string;
  to?: string;
}): Promise<number> {
  const conditions = [];
  if (filters.domain) conditions.push(eq(documents.domain, filters.domain));
  if (filters.type) conditions.push(eq(documents.type, filters.type));
  if (filters.from) conditions.push(gte(documents.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(documents.createdAt, new Date(filters.to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(documents)
    .where(where);
  return row?.n ?? 0;
}

export async function openDocumentFile(id: string): Promise<{ ok: boolean; error?: string; filePath?: string }> {
  const doc = await getDocument(id);
  if (!doc) return { ok: false, error: "Document not found" };
  if (doc.type !== "file") return { ok: false, error: "Document is not a file" };
  if (!doc.filePath) return { ok: false, error: "Document has no file_path" };
  if (!doc.filePath.startsWith("/Users/")) return { ok: false, error: "Refusing to open path outside /Users/" };

  const { exec } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    exec(`open ${JSON.stringify(doc.filePath)}`, (err) => (err ? reject(err) : resolve()));
  });
  return { ok: true, filePath: doc.filePath };
}

export async function getCanonicalDocuments(topics: string[]) {
  if (!topics.length) return [];
  const arrayLiteral =
    "{" + topics.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",") + "}";
  const rows = (await db.execute(sql`
    SELECT id, domain, type, title, content, source, metadata, canonical_for,
           created_at, updated_at
    FROM documents
    WHERE canonical_for && ${arrayLiteral}::text[]
    ORDER BY updated_at DESC
  `)) as unknown as Array<Record<string, unknown>>;
  return rows;
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
