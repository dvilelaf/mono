/**
 * Token-aware text chunker. Approximates tokens as words * 1.3.
 * 1000-token chunks with 100-token overlap.
 */

const TOKENS_PER_WORD = 1.3;
const CHUNK_TOKENS = 1000;
const OVERLAP_TOKENS = 100;

const CHUNK_WORDS = Math.floor(CHUNK_TOKENS / TOKENS_PER_WORD); // ~769
const OVERLAP_WORDS = Math.floor(OVERLAP_TOKENS / TOKENS_PER_WORD); // ~76

export interface Chunk {
  text: string;
  chunkIndex: number;
  pageNumber?: number;
}

export function chunkText(text: string): Chunk[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const words = cleaned.split(" ");
  if (words.length <= CHUNK_WORDS) {
    return [{ text: cleaned, chunkIndex: 0 }];
  }

  const chunks: Chunk[] = [];
  const stride = CHUNK_WORDS - OVERLAP_WORDS;
  let idx = 0;
  for (let start = 0; start < words.length; start += stride) {
    const slice = words.slice(start, start + CHUNK_WORDS);
    if (slice.length === 0) break;
    chunks.push({ text: slice.join(" "), chunkIndex: idx++ });
    if (start + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
}

/**
 * Chunk text that's already split per page (e.g. from pdftotext -layout with form-feed splits).
 * Each page gets its own chunks tagged with page_number.
 */
export function chunkPages(pages: string[]): Chunk[] {
  const out: Chunk[] = [];
  let idx = 0;
  for (let i = 0; i < pages.length; i++) {
    const pageChunks = chunkText(pages[i]);
    for (const c of pageChunks) {
      out.push({ text: c.text, chunkIndex: idx++, pageNumber: i + 1 });
    }
  }
  return out;
}
