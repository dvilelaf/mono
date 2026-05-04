import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { embedQwen, vectorLiteral } from "./embedding-v2.js";

export interface SearchHit {
  documentId: string;
  title: string | null;
  filePath: string | null;
  domain: string | null;
  chunkIndex: number;
  pageNumber: number | null;
  text: string;
  vectorScore: number | null;
  keywordScore: number | null;
  combinedScore: number;
}

export async function hybridSearch(query: string, limit = 10): Promise<SearchHit[]> {
  const qVec = await embedQwen(query);
  const qLit = vectorLiteral(qVec);

  // Vector search — exact (no ANN index because 2560 dims > pgvector ANN limit)
  const vectorRows = (await db.execute(sql`
    SELECT
      c.id            AS chunk_id,
      c.document_id   AS document_id,
      c.chunk_index,
      c.page_number,
      c.text,
      d.title,
      d.file_path,
      d.domain,
      1 - (c.embedding <=> ${sql.raw(`'${qLit}'::vector`)}) AS vector_score
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${sql.raw(`'${qLit}'::vector`)}
    LIMIT 50
  `)) as unknown as Array<{
    chunk_id: string;
    document_id: string;
    chunk_index: number;
    page_number: number | null;
    text: string;
    title: string | null;
    file_path: string | null;
    domain: string | null;
    vector_score: number;
  }>;

  // Keyword search
  const keywordRows = (await db.execute(sql`
    SELECT
      c.id            AS chunk_id,
      c.document_id   AS document_id,
      c.chunk_index,
      c.page_number,
      c.text,
      d.title,
      d.file_path,
      d.domain,
      ts_rank(c.tsv, plainto_tsquery('english', ${query})) AS keyword_score
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.tsv @@ plainto_tsquery('english', ${query})
    ORDER BY keyword_score DESC
    LIMIT 50
  `)) as unknown as Array<{
    chunk_id: string;
    document_id: string;
    chunk_index: number;
    page_number: number | null;
    text: string;
    title: string | null;
    file_path: string | null;
    domain: string | null;
    keyword_score: number;
  }>;

  // Merge by document_id, keeping the best chunk from either source.
  type Best = SearchHit & { _vec?: number; _kw?: number };
  const byDoc = new Map<string, Best>();

  // Normalise vector: already cosine similarity (1 - distance), in [-1,1] but typically 0..1
  // Normalise keyword: ts_rank is unbounded; min-max within result set
  const maxKw = keywordRows.reduce((m, r) => Math.max(m, r.keyword_score), 0) || 1;

  for (const r of vectorRows) {
    const score = r.vector_score; // 0..1 ideally
    const cur = byDoc.get(r.document_id);
    const candidate: Best = {
      documentId: r.document_id,
      title: r.title,
      filePath: r.file_path,
      domain: r.domain,
      chunkIndex: r.chunk_index,
      pageNumber: r.page_number,
      text: r.text,
      vectorScore: score,
      keywordScore: null,
      combinedScore: score,
      _vec: score,
    };
    if (!cur || candidate.combinedScore > cur.combinedScore) byDoc.set(r.document_id, candidate);
  }

  for (const r of keywordRows) {
    const norm = r.keyword_score / maxKw;
    const cur = byDoc.get(r.document_id);
    if (cur) {
      cur.keywordScore = r.keyword_score;
      // bump combined if keyword is stronger than current vector-only score
      const blended = Math.max(cur.combinedScore, norm);
      cur.combinedScore = blended;
    } else {
      byDoc.set(r.document_id, {
        documentId: r.document_id,
        title: r.title,
        filePath: r.file_path,
        domain: r.domain,
        chunkIndex: r.chunk_index,
        pageNumber: r.page_number,
        text: r.text,
        vectorScore: null,
        keywordScore: r.keyword_score,
        combinedScore: norm,
        _kw: r.keyword_score,
      });
    }
  }

  const merged = Array.from(byDoc.values()).sort(
    (a, b) => b.combinedScore - a.combinedScore,
  );
  return merged.slice(0, limit).map((h) => ({
    documentId: h.documentId,
    title: h.title,
    filePath: h.filePath,
    domain: h.domain,
    chunkIndex: h.chunkIndex,
    pageNumber: h.pageNumber,
    text: h.text,
    vectorScore: h.vectorScore,
    keywordScore: h.keywordScore,
    combinedScore: h.combinedScore,
  }));
}
