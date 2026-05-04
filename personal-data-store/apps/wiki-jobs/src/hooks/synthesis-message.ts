import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const SYNTHESIS_FILES = [
  { key: "what-changed", file: "what-changed.md", heading: "What Changed" },
  { key: "goal-scorecard", file: "goal-scorecard.md", heading: "Goal Scorecard" },
  { key: "decision-queue", file: "decision-queue.md", heading: "Decision Queue" },
] as const;

export type PostSynthesisHookResult = {
  posted: boolean;
  messageId?: string;
  delivered?: boolean;
  error?: string;
  skipped?: string;
};

export async function postSynthesisHook(): Promise<PostSynthesisHookResult> {
  const synthesisDir = path.join(config.wikiDir, "20-synthesis");

  const sections: { heading: string; content: string }[] = [];
  for (const f of SYNTHESIS_FILES) {
    const filePath = path.join(synthesisDir, f.file);
    try {
      const content = await readFile(filePath, "utf8");
      sections.push({ heading: f.heading, content: content.trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { posted: false, skipped: `Could not read ${f.file}: ${message}` };
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const subject = `PDS Synthesis — ${today}`;
  const body = sections
    .map((s) => `# ${s.heading}\n\n${s.content}`)
    .join("\n\n---\n\n");

  const apiBase = process.env.PDS_API_BASE ?? "http://localhost:3000";
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return { posted: false, skipped: "API_KEY not set; cannot POST to messages endpoint" };
  }

  const res = await fetch(`${apiBase}/api/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      type: "synthesis",
      subject,
      body,
      metadata: { date: today, sections: SYNTHESIS_FILES.map((f) => f.key) },
      send: true,
    }),
  });

  if (!res.ok) {
    return { posted: false, error: `POST /api/messages failed: ${res.status} ${await res.text()}` };
  }

  const data = (await res.json()) as {
    message: { id: string };
    delivery: { delivered: boolean; error?: string } | null;
  };

  return {
    posted: true,
    messageId: data.message.id,
    delivered: data.delivery?.delivered,
    error: data.delivery?.error,
  };
}
