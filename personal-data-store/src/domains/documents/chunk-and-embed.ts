import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { chunkText, type Chunk } from "./chunker.js";
import { embedQwen, vectorLiteral, EMBED_DIM } from "./embedding-v2.js";

/**
 * Chunk plain document content, embed each chunk via local ollama qwen3-embedding:4b
 * (2560 dims), and insert rows into document_chunks. Existing chunks for the
 * document are wiped first to keep the operation idempotent.
 *
 * For PDF/file content with page boundaries, use the v2 indexer's chunkPages
 * directly. This helper is for plain-text documents (notes, transcripts, etc.).
 */
export async function chunkAndEmbed(
  documentId: string,
  content: string,
): Promise<{ chunks: number }> {
  if (!content || !content.trim()) {
    await db.execute(sql`DELETE FROM document_chunks WHERE document_id = ${documentId}`);
    return { chunks: 0 };
  }

  const chunks: Chunk[] = chunkText(content);

  await db.execute(sql`DELETE FROM document_chunks WHERE document_id = ${documentId}`);

  let inserted = 0;
  for (const chunk of chunks) {
    if (!chunk.text.trim()) continue;
    const vec = await embedQwen(chunk.text);
    if (vec.length !== EMBED_DIM) {
      throw new Error(`unexpected embedding dim ${vec.length} on chunk ${chunk.chunkIndex}`);
    }
    const lit = vectorLiteral(vec);
    await db.execute(sql`
      INSERT INTO document_chunks (id, document_id, chunk_index, page_number, text, embedding, tsv, created_at)
      VALUES (
        gen_random_uuid(),
        ${documentId},
        ${chunk.chunkIndex},
        ${chunk.pageNumber ?? null},
        ${chunk.text},
        ${sql.raw(`'${lit}'::vector`)},
        to_tsvector('english', ${chunk.text}),
        NOW()
      )
    `);
    inserted++;
  }

  return { chunks: inserted };
}
