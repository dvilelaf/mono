import type { Connector, SyncResult } from "./connector.interface.js";
import { runAllProbes, type ProbeResult } from "../domains/goals/goals.probe.js";
import { listGoals } from "../domains/goals/goals.service.js";
import { createDocument } from "../domains/documents/documents.service.js";
import { sendNtfy, frontendUrl } from "../services/ntfy.js";
import { db } from "../db/index.js";
import { documents } from "../domains/documents/documents.schema.js";
import { sql } from "drizzle-orm";

async function fetchCanonicalForTopics(topics: string[]): Promise<string> {
  if (topics.length === 0) return "";
  const literal = topics.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",");
  const rows = await db
    .select({ title: documents.title, content: documents.content, canonicalFor: documents.canonicalFor })
    .from(documents)
    .where(sql`${documents.canonicalFor} && ${`{${literal}}`}::text[]`);
  return rows
    .map((r) => `### ${r.title ?? "(untitled)"}\n${(r.content ?? "").slice(0, 1500)}`)
    .join("\n\n---\n\n");
}

function describeProbe(p: ProbeResult, goal: { title: string; unit: string | null; targetValue: string | null; targetDirection: string }): string {
  const unit = goal.unit ?? "";
  const target = goal.targetValue !== null ? ` (target ${goal.targetDirection} ${goal.targetValue}${unit})` : "";
  const value = p.observedValue === null ? "n/a" : `${p.observedValue}${unit}`;
  const prev = p.previousValue === null ? "" : ` from ${p.previousValue}${unit}`;
  const eta = p.eta ? ` · ETA ${p.eta.slice(0, 10)}` : "";
  return `- **${goal.title}** — ${p.status} · ${value}${prev}${target} · ${p.trajectory}${eta}`;
}

function severityForStatus(status: string, changed: boolean): 1 | 2 | 3 | 4 | 5 {
  if (status === "off_track") return 4;
  if (status === "at_risk") return changed ? 4 : 3;
  if (changed) return 3;
  return 2;
}

async function buildAnalysisContent(probes: ProbeResult[], goalsList: Awaited<ReturnType<typeof listGoals>>, canonical: string): Promise<string> {
  const bySlug = new Map(goalsList.map((g) => [g.slug, g]));
  const lines: string[] = [];
  lines.push(`# Goal trajectory probe — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(`Probed ${probes.length} goals.`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  for (const p of probes) {
    const goal = bySlug.get(p.slug);
    if (!goal) continue;
    lines.push(describeProbe(p, goal));
  }
  const flagged = probes.filter((p) => p.status === "off_track" || p.status === "at_risk" || p.changed);
  if (flagged.length) {
    lines.push("");
    lines.push("## Flagged");
    lines.push("");
    for (const p of flagged) {
      const goal = bySlug.get(p.slug);
      if (!goal) continue;
      lines.push(`- ${goal.title}: ${p.status}${p.changed ? ` (was ${p.previousStatus})` : ""}, trajectory ${p.trajectory}.`);
    }
  }
  if (canonical.trim()) {
    lines.push("");
    lines.push("## Canonical references consulted");
    lines.push("");
    lines.push(canonical.slice(0, 4000));
  }
  return lines.join("\n");
}

export const goalsConnector: Connector = {
  name: "goals",
  schedule: process.env.GOALS_PROBE_SCHEDULE ?? "0 2 * * *",
  async sync(): Promise<SyncResult> {
    const goalsList = await listGoals();
    if (goalsList.length === 0) {
      return { recordsSynced: 0 };
    }
    const probes = await runAllProbes();
    const errors: string[] = [];

    const allTopics = Array.from(
      new Set(goalsList.flatMap((g) => g.canonicalTopics ?? [])),
    );
    let canonical = "";
    try {
      canonical = await fetchCanonicalForTopics(allTopics);
    } catch (err) {
      errors.push(`canonical fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const content = await buildAnalysisContent(probes, goalsList, canonical);
    try {
      await createDocument({
        domain: "goals",
        type: "goal-trajectory-brief",
        title: `Goal probe ${new Date().toISOString().slice(0, 10)}`,
        content,
        source: "claude",
        metadata: {
          probes: probes.map((p) => ({ slug: p.slug, status: p.status, changed: p.changed, trajectory: p.trajectory, value: p.observedValue, eta: p.eta })),
          canonicalTopics: allTopics,
        },
      });
    } catch (err) {
      errors.push(`document insert failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const flagged = probes.filter((p) => p.status === "off_track" || p.status === "at_risk" || p.changed);
    if (flagged.length) {
      const headlineParts = flagged.slice(0, 4).map((p) => {
        const goal = goalsList.find((g) => g.slug === p.slug);
        return `${goal?.title ?? p.slug}: ${p.status}`;
      });
      const severity = flagged.some((p) => p.status === "off_track")
        ? 5
        : flagged.some((p) => p.status === "at_risk" && p.changed)
          ? 4
          : 3;
      const ntfyResult = await sendNtfy({
        title: `Goals: ${flagged.length} flagged`,
        message: headlineParts.join(" · "),
        click: frontendUrl("/goals"),
        priority: severity as 1 | 2 | 3 | 4 | 5,
        tags: ["goals", "trajectory"],
      });
      if (!ntfyResult.ok) errors.push(`ntfy: ${ntfyResult.error}`);
    }

    return { recordsSynced: probes.length, errors: errors.length ? errors : undefined };
  },
};
