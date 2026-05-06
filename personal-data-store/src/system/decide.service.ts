import { spawn } from "child_process";
import { listGoals } from "../domains/goals/goals.service.js";
import { listAlerts } from "../domains/watchdog/watchdog.service.js";
import { listInterventions } from "../domains/interventions/interventions.service.js";
import {
  getCanonicalDocuments,
  semanticSearch,
} from "../domains/documents/documents.service.js";

export interface DecideInput {
  question: string;
  context?: string;
}

export interface Citation {
  kind: "goal" | "alert" | "intervention" | "document" | "canonical";
  ref: string;
  title?: string;
}

export interface DecideResult {
  question: string;
  answer: string;
  conflictingGoals: Array<{ slug: string; title: string }>;
  citations: Citation[];
  sources: {
    goals: number;
    alerts: number;
    interventions: number;
    documents: number;
    canonical: number;
  };
  promptChars: number;
  dryRun?: boolean;
}

const ANSWER_MAX_CHARS = 4000;
const PROMPT_DOC_SUMMARY_CHARS = 600;
const PROMPT_CANONICAL_CONTENT_CHARS = 1200;

export async function runDecide(input: DecideInput): Promise<DecideResult> {
  const question = (input.question ?? "").trim();
  if (!question) {
    throw new Error("question is required");
  }

  // Pull live state in parallel.
  const semDocsPromise = semanticSearch(question, 8).catch(
    () => [] as unknown[],
  );
  const [allGoals, openAlerts, activeInterventions, semDocsRaw] =
    await Promise.all([
      listGoals(),
      listAlerts({ resolved: false, limit: 50 }),
      listInterventions({ status: "active" }),
      semDocsPromise,
    ]);

  const semDocs = semDocsRaw as Array<Record<string, unknown>>;

  // Topics inferred from goals + interventions, used to pull canonical docs.
  const topicSet = new Set<string>();
  for (const g of allGoals) {
    for (const t of g.canonicalTopics ?? []) topicSet.add(t);
  }
  for (const i of activeInterventions) {
    for (const t of (i.canonicalTopics as string[] | null) ?? [])
      topicSet.add(t);
  }
  const canonicalDocs = topicSet.size
    ? ((await getCanonicalDocuments([...topicSet])) as Array<
        Record<string, unknown>
      >)
    : [];

  const prompt = buildPrompt({
    question,
    context: input.context,
    goals: allGoals,
    alerts: openAlerts,
    interventions: activeInterventions,
    semDocs,
    canonicalDocs,
  });

  const sources = {
    goals: allGoals.length,
    alerts: openAlerts.length,
    interventions: activeInterventions.length,
    documents: semDocs.length,
    canonical: canonicalDocs.length,
  };

  const citations: Citation[] = [
    ...allGoals.map<Citation>((g) => ({
      kind: "goal",
      ref: g.slug,
      title: g.title,
    })),
    ...openAlerts.map<Citation>((a) => ({
      kind: "alert",
      ref: a.id,
      title: a.title,
    })),
    ...activeInterventions.map<Citation>((i) => ({
      kind: "intervention",
      ref: (i.slug as string) ?? (i.id as string),
      title: i.title as string,
    })),
    ...semDocs.map<Citation>((d) => ({
      kind: "document",
      ref: String(d.document_id ?? d.id ?? ""),
      title: (d.title as string) ?? undefined,
    })),
    ...canonicalDocs.map<Citation>((d) => ({
      kind: "canonical",
      ref: String(d.id ?? ""),
      title: (d.title as string) ?? undefined,
    })),
  ];

  if (process.env.PDS_DECIDE_DRY_RUN === "1") {
    return {
      question,
      answer: prompt,
      conflictingGoals: [],
      citations,
      sources,
      promptChars: prompt.length,
      dryRun: true,
    };
  }

  const raw = await callClaude(prompt);
  const parsed = parseModelOutput(raw);

  // Map the model's named conflicting goals back to known slugs.
  const goalIndex = new Map<string, { slug: string; title: string }>();
  for (const g of allGoals) {
    goalIndex.set(g.slug.toLowerCase(), { slug: g.slug, title: g.title });
    goalIndex.set(g.title.toLowerCase(), { slug: g.slug, title: g.title });
  }
  const conflicting: Array<{ slug: string; title: string }> = [];
  const seen = new Set<string>();
  for (const c of parsed.conflicts) {
    const hit = goalIndex.get(c.toLowerCase());
    if (hit && !seen.has(hit.slug)) {
      conflicting.push(hit);
      seen.add(hit.slug);
    }
  }

  return {
    question,
    answer: parsed.answer.slice(0, ANSWER_MAX_CHARS),
    conflictingGoals: conflicting,
    citations,
    sources,
    promptChars: prompt.length,
  };
}

interface PromptArgs {
  question: string;
  context?: string;
  goals: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
  interventions: Array<Record<string, unknown>>;
  semDocs: Array<Record<string, unknown>>;
  canonicalDocs: Array<Record<string, unknown>>;
}

function buildPrompt(a: PromptArgs): string {
  const goalsBlock = a.goals.length
    ? a.goals
        .map((g) => {
          const target = formatGoalTarget(g);
          const current =
            g.currentValue !== null && g.currentValue !== undefined
              ? `current=${g.currentValue}${g.unit ? ` ${g.unit}` : ""}`
              : "current=unknown";
          const status = g.status ? `status=${g.status}` : "";
          const eta = g.eta ? `eta=${formatDate(g.eta as string | Date)}` : "";
          return `- [${g.slug}] ${g.title} (domain=${g.domain}, ${target}, ${current}${status ? ", " + status : ""}${eta ? ", " + eta : ""})`;
        })
        .join("\n")
    : "(none)";

  const alertsBlock = a.alerts.length
    ? a.alerts
        .map(
          (al) =>
            `- [${al.severity}] ${al.title}${al.detail ? ` — ${truncate(String(al.detail), 200)}` : ""}`,
        )
        .join("\n")
    : "(none)";

  const intvBlock = a.interventions.length
    ? a.interventions
        .map((i) => {
          const slug = i.slug as string;
          const title = i.title as string;
          const type = i.type as string;
          const protocol = i.protocol
            ? ` — ${truncate(String(i.protocol), 160)}`
            : "";
          const since = i.startDate
            ? ` since ${formatDate(i.startDate as string | Date)}`
            : "";
          return `- [${slug}] ${title} (${type}${since})${protocol}`;
        })
        .join("\n")
    : "(none)";

  const docsBlock = a.semDocs.length
    ? a.semDocs
        .map((d) => {
          const title = (d.title as string) ?? "(untitled)";
          const summary = truncate(
            String(d.summary ?? ""),
            PROMPT_DOC_SUMMARY_CHARS,
          );
          return `- ${title}${summary ? `\n  ${summary}` : ""}`;
        })
        .join("\n")
    : "(none)";

  const canonicalBlock = a.canonicalDocs.length
    ? a.canonicalDocs
        .map((d) => {
          const title = (d.title as string) ?? "(untitled)";
          const topics = Array.isArray(d.canonical_for)
            ? (d.canonical_for as string[]).join(", ")
            : "";
          const content = truncate(
            String(d.content ?? d.summary ?? ""),
            PROMPT_CANONICAL_CONTENT_CHARS,
          );
          return `### ${title}${topics ? ` (topics: ${topics})` : ""}\n${content}`;
        })
        .join("\n\n")
    : "(none)";

  return `You are the Personal Data Store decision oracle for Oak. You answer questions using ONLY the data and canonical guidance supplied below. If the data is insufficient, say so plainly.

USER QUESTION:
${a.question}
${a.context ? `\nADDITIONAL CONTEXT:\n${a.context}\n` : ""}
ACTIVE GOALS:
${goalsBlock}

OPEN WATCHDOG ALERTS:
${alertsBlock}

ACTIVE INTERVENTIONS:
${intvBlock}

SEMANTICALLY RELEVANT DOCUMENTS:
${docsBlock}

CANONICAL GUIDANCE (authoritative; treat as Oak's own decided positions):
${canonicalBlock}

Rules:
- British English. Direct, no filler.
- Ground every claim in the data above. Do not invent metrics.
- If a recommendation conflicts with an active goal, list that goal's slug under "conflicts".
- Keep "answer" under 350 words.

Respond with ONLY a single JSON object on stdout, no markdown fence, no preamble:
{"answer": "<short grounded recommendation>", "conflicts": ["<goal slug or title>", ...]}`;
}

function formatGoalTarget(g: Record<string, unknown>): string {
  const dir = g.targetDirection as string;
  const unit = (g.unit as string | null) ?? "";
  const u = unit ? ` ${unit}` : "";
  if (dir === "range") {
    return `target=${g.targetRangeLow ?? "?"}-${g.targetRangeHigh ?? "?"}${u}`;
  }
  return `target=${dir} ${g.targetValue ?? "?"}${u}`;
}

function formatDate(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString().slice(0, 10);
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

interface ParsedOutput {
  answer: string;
  conflicts: string[];
}

function parseModelOutput(raw: string): ParsedOutput {
  const trimmed = raw.trim();
  // Try to locate the first JSON object in the output.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      const obj = JSON.parse(slice) as {
        answer?: unknown;
        conflicts?: unknown;
      };
      const answer =
        typeof obj.answer === "string" && obj.answer.trim()
          ? obj.answer.trim()
          : trimmed;
      const conflicts = Array.isArray(obj.conflicts)
        ? obj.conflicts.filter((x): x is string => typeof x === "string")
        : [];
      return { answer, conflicts };
    } catch {
      // fall through
    }
  }
  return { answer: trimmed, conflicts: [] };
}

function callClaude(prompt: string): Promise<string> {
  const claudePath = process.env.CLAUDE_PATH || "claude";
  const timeoutMs = Number(process.env.PDS_DECIDE_TIMEOUT_MS) || 90_000;

  return new Promise((resolve, reject) => {
    const proc = spawn(claudePath, ["--print"], { env: process.env });
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const errMsg = stderr.slice(0, 500) || `exit code ${code}`;
        return reject(new Error(`Claude CLI failed: ${errMsg}`));
      }
      resolve(stdout.trim());
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
