const CHUNK_SIZE = 500;

export const EMBEDDING_DIM = 768;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [""];
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
  });

  if (!response.ok) throw new Error(`Ollama embedding error: ${response.status}`);
  const data = (await response.json()) as { embedding: number[] };
  if (!data.embedding || data.embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding dimension: ${data.embedding?.length}`);
  }
  return data.embedding;
}
