import { spawn } from "node:child_process";
import type { Connector, SyncResult } from "./connector.interface.js";
import { listGoals } from "../domains/goals/goals.service.js";
import { listInterventions, evaluateIntervention, type MetricEvaluation } from "../domains/interventions/interventions.service.js";
import { checkinSummary } from "../domains/checkin/checkin.service.js";
import { createDocument } from "../domains/documents/documents.service.js";
import { sendNtfy, frontendUrl, summarize } from "../services/ntfy.js";
import { db } from "../db/index.js";
import { documents } from "../domains/documents/documents.schema.js";
import { sql } from "drizzle-orm";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const CLAUDE_TIMEOUT_MS = parseInt(process.env.BRIEFING_CLAUDE_TIMEOUT_MS ?? String(5 * 60 * 1000), 10);

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date(Date.now() - 86400_000);
  return d.toISOString().slice(0, 10);
}

async function fetchCanonicalForTopics(topics: string[]): Promise<string> {
  if (topics.length === 0) return "";
  const literal = topics.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",");
  const rows = await db
    .select({ title: documents.title, content: documents.content, canonicalFor: documents.canonicalFor })
    .from(documents)
    .where(sql`${documents.canonicalFor} && ${`{${literal}}`}::text[]`);
  return rows
    .map((r) => `### ${r.title ?? "(untitled)"} (${(r.canonicalFor ?? []).join(", ")})\n${(r.content ?? "").slice(0, 1500)}`)
    .join("\n\n---\n\n");
}

interface BlockerPick {
  slug: string;
  title: string;
  domain: string;
  status: string;
  reason: string;
}

function pickTopBlocker(goalsList: Awaited<ReturnType<typeof listGoals>>): BlockerPick | null {
  const score = (s: string) => (s === "off_track" ? 4 : s === "at_risk" ? 3 : s === "unknown" ? 2 : s === "on_track" ? 1 : 0);
  const ranked = [...goalsList]
    .filter((g) => g.status !== "achieved")
    .sort((a, b) => {
      const d = score(b.status) - score(a.status);
      if (d !== 0) return d;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
  const top = ranked[0];
  if (!top) return null;
  return {
    slug: top.slug,
    title: top.title,
    domain: top.domain,
    status: top.status,
    reason: `${top.status} · current ${top.currentValue ?? "n/a"}${top.unit ?? ""}${top.targetValue !== null ? ` · target ${top.targetDirection} ${top.targetValue}${top.unit ?? ""}` : ""}`,
  };
}

function isSignificantEval(e: MetricEvaluation): boolean {
  if (e.deltaPct === null) return false;
  return Math.abs(e.deltaPct) >= 10 && e.nBefore >= 2 && e.nAfter >= 2;
}

async function runClaudeCli(prompt: string): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const childEnv = { ...process.env };
    for (const key of [
      "CLAUDE_CODE_OAUTH_TOKEN",
      "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
      "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_CODE_EXECPATH",
      "CLAUDECODE",
      "CLAUDE_AGENT_SDK_VERSION",
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_BASE_URL",
    ]) {
      delete childEnv[key];
    }
    const child = spawn(
      CLAUDE_BIN,
      ["-p", "--permission-mode", "bypassPermissions"],
      { env: childEnv, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), CLAUDE_TIMEOUT_MS);
    child.stdout.on("data", (c) => { stdout += c.toString(); });
    child.stderr.on("data", (c) => { stderr += c.toString(); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, stdout, stderr, code });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr: stderr + `\n[spawn error] ${err.message}`, code: null });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function buildClaudePrompt(args: {
  date: string;
  goalsBlock: string;
  interventionsBlock: string;
  checkinBlock: string;
  blocker: BlockerPick | null;
  canonical: string;
}): string {
  const blockerLine = args.blocker
    ? `${args.blocker.title} (${args.blocker.domain}) — ${args.blocker.reason}`
    : "None — all goals achieved or insufficient data.";
  return [
    `You are the Morning Trajectory Briefing for Oak. Today's date is ${args.date}.`,
    "",
    "Generate a concise (200–400 word) morning briefing in markdown that Oak will read in 30 seconds. Use British English.",
    "",
    "Required structure:",
    "1. **One-line headline** capturing where Oak stands today.",
    "2. **Status by domain** — traffic-light bullets (🟢 on track / 🟡 at risk / 🔴 off track / ⚪ unknown) grouping goals by domain (health, fitness, finance, etc.). One line per domain.",
    "3. **Top blocker** — the single most important thing to focus on today, with a one-sentence reason and a concrete next action.",
    "4. **Active interventions** — only call out interventions with significant signal (≥10% change). Skip if none.",
    "5. **Yesterday's adherence** — one line on supplements/measurements/food from yesterday's check-in.",
    "",
    "Constraints:",
    "- No fluff, no preamble like 'Here is your briefing'. Open directly with the headline.",
    "- No emojis except the traffic-light dots in the status section.",
    "- Ground recommendations in the canonical reference docs below; cite by title in parentheses when used.",
    "- If a section has no data, say so in one short line.",
    "- British English (optimisation, behaviour, etc.).",
    "",
    "<canonical-references>",
    args.canonical || "No canonical documents available for the active topics.",
    "</canonical-references>",
    "",
    "<goals>",
    args.goalsBlock,
    "</goals>",
    "",
    "<interventions>",
    args.interventionsBlock,
    "</interventions>",
    "",
    "<checkin yesterday>",
    args.checkinBlock,
    "</checkin>",
    "",
    `<top-blocker-candidate>${blockerLine}</top-blocker-candidate>`,
    "",
    "Output the briefing markdown only. Do not wrap in code fences. Do not add commentary after the briefing.",
  ].join("\n");
}

function buildGoalsBlock(goalsList: Awaited<ReturnType<typeof listGoals>>): string {
  if (goalsList.length === 0) return "No goals configured.";
  return goalsList
    .map((g) => {
      const cur = g.currentValue ?? "n/a";
      const prev = g.previousValue ?? "n/a";
      const target = g.targetValue !== null
        ? `target ${g.targetDirection} ${g.targetValue}${g.unit ?? ""}`
        : g.targetRangeLow !== null && g.targetRangeHigh !== null
          ? `target range ${g.targetRangeLow}–${g.targetRangeHigh}${g.unit ?? ""}`
          : "no target";
      const eta = g.eta ? ` · ETA ${new Date(g.eta).toISOString().slice(0, 10)}` : "";
      return `- [${g.domain}] ${g.title} (${g.slug}) — status=${g.status} · current=${cur}${g.unit ?? ""} (prev=${prev}${g.unit ?? ""}) · ${target}${eta} · priority=${g.priority}`;
    })
    .join("\n");
}

function buildInterventionsBlock(rows: Array<{ intervention: Awaited<ReturnType<typeof listInterventions>>[number]; evaluations: MetricEvaluation[] }>): string {
  if (rows.length === 0) return "No active interventions.";
  return rows
    .map(({ intervention: i, evaluations }) => {
      const evalLines = evaluations.length === 0
        ? ["  _no metric data_"]
        : evaluations.map((e) => {
            const before = e.valueBefore === null ? "n/a" : e.valueBefore.toFixed(2);
            const after = e.valueAfter === null ? "n/a" : e.valueAfter.toFixed(2);
            const pct = e.deltaPct === null ? "?" : `${e.deltaPct >= 0 ? "+" : ""}${e.deltaPct.toFixed(1)}%`;
            const sig = isSignificantEval(e) ? " ⚠ significant" : "";
            return `  - ${e.metricName}: ${before} → ${after} (${pct}) n_pre=${e.nBefore} n_post=${e.nAfter}${sig}`;
          });
      return [
        `- ${i.title} (${i.slug}) — type=${i.type} · started=${new Date(i.startDate).toISOString().slice(0, 10)} · status=${i.status}`,
        i.hypothesis ? `  hypothesis: ${i.hypothesis}` : "",
        ...evalLines,
      ].filter(Boolean).join("\n");
    })
    .join("\n");
}

function buildCheckinBlock(summary: Awaited<ReturnType<typeof checkinSummary>>): string {
  const supp = summary.supplements;
  const lines: string[] = [];
  lines.push(`- date: ${summary.day}`);
  lines.push(`- supplements: ${supp.taken}/${supp.totalActive} taken${summary.complete ? "" : " (incomplete)"}`);
  lines.push(`- measurements logged: ${summary.measurements.length}`);
  lines.push(`- nutrition entries: ${summary.nutrition.length}`);
  lines.push(`- complete: ${summary.complete}`);
  return lines.join("\n");
}

export const briefingConnector: Connector = {
  name: "morning_briefing",
  schedule: process.env.BRIEFING_SCHEDULE ?? "30 6 * * *",
  async sync(): Promise<SyncResult> {
    const errors: string[] = [];
    const date = todayISO();
    const yday = yesterdayISO();

    const goalsList = await listGoals();
    const active = await listInterventions({ status: "active" });

    const interventionRows: Array<{ intervention: typeof active[number]; evaluations: MetricEvaluation[] }> = [];
    for (const intervention of active) {
      try {
        const evaluations = await evaluateIntervention(intervention.id);
        interventionRows.push({ intervention, evaluations });
      } catch (err) {
        errors.push(`evaluate ${intervention.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    let yesterdayCheckin: Awaited<ReturnType<typeof checkinSummary>>;
    try {
      yesterdayCheckin = await checkinSummary(yday);
    } catch (err) {
      errors.push(`checkin: ${err instanceof Error ? err.message : String(err)}`);
      yesterdayCheckin = {
        day: yday,
        supplements: { stack: [], totalActive: 0, taken: 0 },
        measurements: [],
        nutrition: [],
        submitted: false,
        complete: false,
      };
    }

    const allTopics = Array.from(new Set([
      ...goalsList.flatMap((g) => g.canonicalTopics ?? []),
      ...active.flatMap((i) => (i.canonicalTopics ?? []) as string[]),
    ]));
    let canonical = "";
    try {
      canonical = await fetchCanonicalForTopics(allTopics);
    } catch (err) {
      errors.push(`canonical fetch: ${err instanceof Error ? err.message : String(err)}`);
    }

    const blocker = pickTopBlocker(goalsList);

    const prompt = buildClaudePrompt({
      date,
      goalsBlock: buildGoalsBlock(goalsList),
      interventionsBlock: buildInterventionsBlock(interventionRows),
      checkinBlock: buildCheckinBlock(yesterdayCheckin),
      blocker,
      canonical,
    });

    const cli = await runClaudeCli(prompt);
    let briefing = cli.stdout.trim();
    if (!cli.ok || !briefing) {
      errors.push(`claude cli exit=${cli.code}: ${cli.stderr.slice(-500)}`);
      briefing = buildFallbackBriefing({ date, goalsList, interventionRows, yesterdayCheckin, blocker });
    }

    let docId: string | null = null;
    try {
      const doc = await createDocument({
        domain: "briefings",
        type: "morning-brief",
        title: `Morning briefing — ${date}`,
        content: briefing,
        source: "claude",
        metadata: {
          date,
          generatedBy: cli.ok ? "claude-cli" : "fallback",
          topBlocker: blocker,
          goalCounts: {
            total: goalsList.length,
            achieved: goalsList.filter((g) => g.status === "achieved").length,
            on_track: goalsList.filter((g) => g.status === "on_track").length,
            at_risk: goalsList.filter((g) => g.status === "at_risk").length,
            off_track: goalsList.filter((g) => g.status === "off_track").length,
            unknown: goalsList.filter((g) => g.status === "unknown").length,
          },
          activeInterventions: interventionRows.length,
          significantInterventions: interventionRows
            .flatMap(({ intervention, evaluations }) => evaluations
              .filter(isSignificantEval)
              .map((e) => ({ slug: intervention.slug, metric: e.metricName, deltaPct: e.deltaPct })))
            ,
          yesterdayAdherence: {
            day: yesterdayCheckin.day,
            supplementsTaken: yesterdayCheckin.supplements.taken,
            supplementsTotal: yesterdayCheckin.supplements.totalActive,
            complete: yesterdayCheckin.complete,
          },
          canonicalTopics: allTopics,
        },
      });
      docId = doc.id;
    } catch (err) {
      errors.push(`document insert: ${err instanceof Error ? err.message : String(err)}`);
    }

    const headline = blocker
      ? `${statusBadge(blocker.status)} ${blocker.title}: ${blocker.status.replace("_", " ")}`
      : "All goals on track or unknown.";
    const message = summarize(briefing.replace(/^#.*\n/m, "").trim(), 240);
    const click = docId ? frontendUrl(`/briefings/${docId}`) : frontendUrl("/today");

    const ntfyResult = await sendNtfy({
      title: `Morning briefing — ${date}`,
      message: `${headline}\n${message}`,
      click,
      priority: blocker?.status === "off_track" ? 4 : 3,
      tags: ["briefing", "morning"],
    });
    if (!ntfyResult.ok) errors.push(`ntfy: ${ntfyResult.error}`);

    return { recordsSynced: 1, errors: errors.length ? errors : undefined };
  },
};

function statusBadge(status: string): string {
  if (status === "off_track") return "🔴";
  if (status === "at_risk") return "🟡";
  if (status === "on_track") return "🟢";
  if (status === "achieved") return "🟢";
  return "⚪";
}

function buildFallbackBriefing(args: {
  date: string;
  goalsList: Awaited<ReturnType<typeof listGoals>>;
  interventionRows: Array<{ intervention: Awaited<ReturnType<typeof listInterventions>>[number]; evaluations: MetricEvaluation[] }>;
  yesterdayCheckin: Awaited<ReturnType<typeof checkinSummary>>;
  blocker: BlockerPick | null;
}): string {
  const lines: string[] = [];
  lines.push(`# Morning briefing — ${args.date}`);
  lines.push("");
  lines.push("_(Fallback brief — Claude CLI unavailable.)_");
  lines.push("");
  lines.push("## Status by domain");
  const byDomain = new Map<string, typeof args.goalsList>();
  for (const g of args.goalsList) {
    const arr = byDomain.get(g.domain) ?? [];
    arr.push(g);
    byDomain.set(g.domain, arr);
  }
  for (const [domain, list] of byDomain) {
    const worst = list.reduce<typeof list[number] | null>((acc, g) => {
      const score = (s: string) => (s === "off_track" ? 4 : s === "at_risk" ? 3 : s === "unknown" ? 2 : s === "on_track" ? 1 : 0);
      if (!acc) return g;
      return score(g.status) > score(acc.status) ? g : acc;
    }, null);
    if (worst) lines.push(`- ${statusBadge(worst.status)} **${domain}** — worst: ${worst.title} (${worst.status})`);
  }
  lines.push("");
  lines.push("## Top blocker");
  if (args.blocker) {
    lines.push(`**${args.blocker.title}** (${args.blocker.domain}) — ${args.blocker.reason}.`);
  } else {
    lines.push("None.");
  }
  lines.push("");
  const sig = args.interventionRows.flatMap(({ intervention, evaluations }) =>
    evaluations.filter(isSignificantEval).map((e) => ({ intervention, e })),
  );
  if (sig.length) {
    lines.push("## Active interventions");
    for (const { intervention, e } of sig) {
      lines.push(`- ${intervention.title} · ${e.metricName} ${e.deltaPct! >= 0 ? "+" : ""}${e.deltaPct!.toFixed(1)}%`);
    }
    lines.push("");
  }
  lines.push("## Yesterday's adherence");
  lines.push(`Supplements ${args.yesterdayCheckin.supplements.taken}/${args.yesterdayCheckin.supplements.totalActive}, ${args.yesterdayCheckin.measurements.length} measurements, ${args.yesterdayCheckin.nutrition.length} nutrition entries. ${args.yesterdayCheckin.complete ? "Complete." : "Incomplete."}`);
  return lines.join("\n");
}
