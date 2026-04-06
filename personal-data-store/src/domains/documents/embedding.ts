const CHUNK_SIZE = 500;

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [""];
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    // Return zero vector as placeholder when no embedding API is configured
    return new Array(1536).fill(0);
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });

  if (!response.ok) throw new Error(`Embedding API error: ${response.status}`);
  const data = (await response.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}
