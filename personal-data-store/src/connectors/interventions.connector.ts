import type { Connector, SyncResult } from "./connector.interface.js";
import {
  listInterventions,
  evaluateIntervention,
  type MetricEvaluation,
} from "../domains/interventions/interventions.service.js";
import { createDocument } from "../domains/documents/documents.service.js";
import { sendNtfy, frontendUrl } from "../services/ntfy.js";
import { db } from "../db/index.js";
import { documents } from "../domains/documents/documents.schema.js";
import { sql } from "drizzle-orm";

async function fetchCanonicalForTopics(topics: string[]): Promise<string> {
  if (topics.length === 0) return "";
  const literal = topics.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",");
  const rows = await db
    .select({ title: documents.title, content: documents.content })
    .from(documents)
    .where(sql`${documents.canonicalFor} && ${`{${literal}}`}::text[]`);
  return rows
    .map((r) => `### ${r.title ?? "(untitled)"}\n${(r.content ?? "").slice(0, 1500)}`)
    .join("\n\n---\n\n");
}

function describeEvaluation(e: MetricEvaluation): string {
  const before = e.valueBefore === null ? "n/a" : e.valueBefore.toFixed(2);
  const after = e.valueAfter === null ? "n/a" : e.valueAfter.toFixed(2);
  const delta = e.delta === null ? "n/a" : e.delta.toFixed(2);
  const pct = e.deltaPct === null ? "" : ` (${e.deltaPct >= 0 ? "+" : ""}${e.deltaPct.toFixed(1)}%)`;
  return `- **${e.metricName}**: ${before} → ${after}, Δ ${delta}${pct} · n_pre=${e.nBefore}, n_post=${e.nAfter}, window=${e.windowDays}d`;
}

function isSignificant(e: MetricEvaluation): boolean {
  if (e.deltaPct === null) return false;
  return Math.abs(e.deltaPct) >= 10 && e.nBefore >= 2 && e.nAfter >= 2;
}

interface InterventionWithEvaluations {
  intervention: Awaited<ReturnType<typeof listInterventions>>[number];
  evaluations: MetricEvaluation[];
}

async function buildAnalysisContent(
  rows: InterventionWithEvaluations[],
  canonical: string,
): Promise<string> {
  const lines: string[] = [];
  lines.push(`# Intervention evaluation — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(`Evaluated ${rows.length} active interventions.`);
  lines.push("");
  for (const row of rows) {
    const i = row.intervention;
    lines.push(`## ${i.title} (${i.slug})`);
    lines.push("");
    lines.push(`Started ${new Date(i.startDate).toISOString().slice(0, 10)} · type ${i.type} · status ${i.status}`);
    if (i.hypothesis) lines.push(`Hypothesis: ${i.hypothesis}`);
    lines.push("");
    if (row.evaluations.length === 0) {
      lines.push("_No affected metrics configured or no data available._");
    } else {
      for (const e of row.evaluations) lines.push(describeEvaluation(e));
    }
    lines.push("");
  }
  if (canonical.trim()) {
    lines.push("## Canonical references consulted");
    lines.push("");
    lines.push(canonical.slice(0, 4000));
  }
  return lines.join("\n");
}

export const interventionsConnector: Connector = {
  name: "interventions",
  schedule: process.env.INTERVENTIONS_EVAL_SCHEDULE ?? "30 2 * * *",
  async sync(): Promise<SyncResult> {
    const active = await listInterventions({ status: "active" });
    if (active.length === 0) {
      return { recordsSynced: 0 };
    }
    const errors: string[] = [];
    const rows: InterventionWithEvaluations[] = [];
    let totalObservations = 0;
    const significant: Array<{ slug: string; title: string; e: MetricEvaluation }> = [];

    for (const intervention of active) {
      try {
        const evaluations = await evaluateIntervention(intervention.id);
        rows.push({ intervention, evaluations });
        totalObservations += evaluations.length;
        for (const e of evaluations) {
          if (isSignificant(e)) {
            significant.push({ slug: intervention.slug, title: intervention.title, e });
          }
        }
      } catch (err) {
        errors.push(`${intervention.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const allTopics = Array.from(
      new Set(active.flatMap((i) => (i.canonicalTopics ?? []) as string[])),
    );
    let canonical = "";
    try {
      canonical = await fetchCanonicalForTopics(allTopics);
    } catch (err) {
      errors.push(`canonical fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const content = await buildAnalysisContent(rows, canonical);
    try {
      await createDocument({
        domain: "interventions",
        type: "intervention-evaluation",
        title: `Intervention evaluation ${new Date().toISOString().slice(0, 10)}`,
        content,
        source: "claude",
        metadata: {
          evaluations: rows.map((r) => ({
            slug: r.intervention.slug,
            evaluations: r.evaluations,
          })),
          canonicalTopics: allTopics,
        },
      });
    } catch (err) {
      errors.push(`document insert failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (significant.length) {
      const headlineParts = significant.slice(0, 4).map((s) => {
        const pct = s.e.deltaPct !== null ? `${s.e.deltaPct >= 0 ? "+" : ""}${s.e.deltaPct.toFixed(1)}%` : "?";
        return `${s.title} · ${s.e.metricName} ${pct}`;
      });
      const ntfyResult = await sendNtfy({
        title: `Interventions: ${significant.length} significant change${significant.length === 1 ? "" : "s"}`,
        message: headlineParts.join(" · "),
        click: frontendUrl("/interventions"),
        priority: 3,
        tags: ["interventions", "evaluation"],
      });
      if (!ntfyResult.ok) errors.push(`ntfy: ${ntfyResult.error}`);
    }

    return { recordsSynced: totalObservations, errors: errors.length ? errors : undefined };
  },
};
