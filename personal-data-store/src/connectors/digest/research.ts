import { spawn } from "child_process";

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export interface ResearchResult {
  interest: { id: string; title: string; content: string };
  query: string;
  results: SearchResult[];
}

async function claudeSearch(query: string): Promise<SearchResult[]> {
  const claudePath = process.env.CLAUDE_PATH || "claude";

  const prompt = `Search the web for recent news and developments about: "${query}"

Return your findings as a JSON array with exactly this structure (output raw JSON only, no markdown code fences, no explanation):
[
  {"title": "Article title", "url": "https://example.com/article", "description": "Brief 1-2 sentence summary of what this covers"}
]

Include 3-5 results focused on content from the last 7 days. If you find no relevant results, return an empty array: []`;

  return new Promise((resolve) => {
    const proc = spawn(claudePath, ["--print", "--allowedTools", "WebSearch"], {
      env: process.env,
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.warn(`[digest/research] Claude search failed (exit ${code}) for: ${query}`);
        if (stderr) console.warn(`[digest/research] stderr: ${stderr.slice(0, 300)}`);
        return resolve([]);
      }

      try {
        const match = stdout.match(/\[[\s\S]*\]/);
        if (!match) {
          console.warn(`[digest/research] No JSON array found in Claude response for: ${query}`);
          return resolve([]);
        }
        const parsed = JSON.parse(match[0]) as { title?: string; url?: string; description?: string }[];
        resolve(
          parsed.map((r) => ({
            title: r.title ?? "",
            url: r.url ?? "",
            description: r.description ?? "",
          }))
        );
      } catch (err) {
        console.warn(`[digest/research] Failed to parse Claude response for: ${query}`, err);
        resolve([]);
      }
    });

    proc.on("error", (err) => {
      console.warn(`[digest/research] Failed to spawn claude for: ${query}`, err);
      resolve([]);
    });
  });
}

export async function researchInterest(interest: {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}): Promise<ResearchResult[]> {
  const queries: string[] = Array.isArray(interest.metadata.queries)
    ? (interest.metadata.queries as string[])
    : [];

  if (queries.length === 0) {
    console.warn(`[digest/research] No queries for interest: ${interest.title}`);
    return [];
  }

  const results: ResearchResult[] = [];
  for (const query of queries) {
    const searchResults = await claudeSearch(query);
    results.push({ interest, query, results: searchResults });
  }
  return results;
}
