import { spawn } from "child_process";
import type { ResearchResult } from "./research.js";

export interface PreviousArticle {
  title: string;
  content: string;
  createdAt: Date;
}

function buildPrompt(
  interestTitle: string,
  interestContext: string,
  research: ResearchResult[],
  previousArticles: PreviousArticle[]
): string {
  const allResults = research.flatMap((r) =>
    r.results.map((s) => `[${r.query}] ${s.title}: ${s.description} (${s.url})`)
  );

  const hasPrevious = previousArticles.length > 0;
  const hasResearch = allResults.length > 0;

  if (!hasResearch && !hasPrevious) {
    return `Generate a brief update on "${interestTitle}" based on general knowledge. Context: ${interestContext}. Keep it under 300 words, direct and practical.`;
  }

  if (!hasResearch && hasPrevious) {
    const lastWritten = previousArticles[0].createdAt.toISOString();
    return `No new search results were found for "${interestTitle}" (last article: ${lastWritten}). Write a single short sentence noting there are no significant updates since then. Do not summarise or repeat previous content.`;
  }

  const prevSection = hasPrevious
    ? `\n\nPREVIOUS ARTICLES (do NOT repeat information already covered here):\n${previousArticles
        .map(
          (a) =>
            `[Written ${a.createdAt.toISOString()}] ${a.title}\n${a.content.slice(0, 700)}${a.content.length > 700 ? "…" : ""}`
        )
        .join("\n\n---\n\n")}\n\nFocus ONLY on what is NEW or has CHANGED since the above articles. If the search results add nothing meaningfully new beyond what is already covered, say so in 1-2 sentences rather than padding.`
    : "";

  return `You are writing a personal digest article for Oak.

Topic: ${interestTitle}
Context: ${interestContext}
${prevSection}

Recent web search results:
${allResults.join("\n")}

Write a concise, personally relevant article (300-500 words) in markdown. Rules:
- Direct style, no filler phrases like "In conclusion" or "It's worth noting"
- Focus on what's new, changed, or actionable since previous articles
- Cross-reference if multiple sources confirm something
- Use headers sparingly, only if genuinely useful
- Be opinionated where the data supports it
- End with 1-3 concrete takeaways if applicable`;
}

export async function generateDigestArticle(
  interestTitle: string,
  interestContext: string,
  research: ResearchResult[],
  previousArticles: PreviousArticle[] = []
): Promise<string> {
  const prompt = buildPrompt(interestTitle, interestContext, research, previousArticles);
  const claudePath = process.env.CLAUDE_PATH || "claude";

  return new Promise((resolve, reject) => {
    const proc = spawn(claudePath, ["--print"], { env: process.env });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        const errMsg = stderr.slice(0, 500) || `exit code ${code}`;
        return reject(new Error(`Claude generation failed: ${errMsg}`));
      }
      resolve(stdout.trim());
    });

    proc.on("error", (err) => reject(err));
  });
}
