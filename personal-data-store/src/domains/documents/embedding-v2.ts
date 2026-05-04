/**
 * Local embedding via Ollama using qwen3-embedding:4b (2560 dims).
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL || "qwen3-embedding:4b";
export const EMBED_DIM = 2560;

// qwen3-embedding context is ~32k tokens, but CSV / dense token text can blow past
// what ollama allocates by default. Cap input by characters as a safety belt; the
// chunker already targets ~1000 tokens, so this only fires on pathological inputs.
const MAX_CHARS = 6000;

export async function embedQwen(text: string): Promise<number[]> {
  const safeText = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: safeText }),
  });
  if (!res.ok) {
    throw new Error(`ollama embed failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { embedding: number[] };
  if (!json.embedding || json.embedding.length !== EMBED_DIM) {
    throw new Error(`unexpected embedding length: ${json.embedding?.length}`);
  }
  return json.embedding;
}

export function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
