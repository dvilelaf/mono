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

interface UpdateDocumentInput {
  domain?: string;
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
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

export async function updateDocument(id: string, input: UpdateDocumentInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.domain !== undefined) updates.domain = input.domain;
  if (input.type !== undefined) updates.type = input.type;
  if (input.title !== undefined) updates.title = input.title;
  if (input.content !== undefined) updates.content = input.content;
  if (input.source !== undefined) updates.source = input.source;
  if (input.metadata !== undefined) updates.metadata = input.metadata;

  const [doc] = await db
    .update(documents)
    .set(updates)
    .where(eq(documents.id, id))
    .returning();
  return doc ?? null;
}

export async function deleteDocument(id: string) {
  await db.delete(embeddings).where(eq(embeddings.documentId, id));
  await db.delete(documents).where(eq(documents.id, id));
}

export async function queryDocuments(filters: {
  domain?: string;
  type?: string;
  from?: string;
  to?: string;
}) {
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

export async function semanticSearch(query: string, limit: number = 10) {
  const queryVector = await generateEmbedding(query);
  const vectorLiteral = `[${queryVector.join(",")}]`;

  const results = await db.execute(sql`
    SELECT e.chunk_text, e.chunk_index, e.document_id,
           d.title, d.domain, d.metadata,
           e.embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)} AS distance
    FROM embeddings e
    JOIN documents d ON d.id = e.document_id
    ORDER BY distance ASC
    LIMIT ${limit}
  `);

  return results;
}
