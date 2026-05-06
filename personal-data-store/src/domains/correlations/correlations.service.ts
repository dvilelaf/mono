import { CORRELATION_SPECS, getSpec, type CorrelationSpec } from "./correlations.spec.js";
import { linearRegression, pearson, type OLSResult } from "./correlations.stats.js";
import { createDocument } from "../documents/documents.service.js";

export interface PredictorResult {
  name: string;
  description: string;
  pearsonR: number | null;
  coefficient: number | null;
  nNonNull: number;
}

export interface RegressionRunResult {
  slug: string;
  goalArea: string;
  title: string;
  windowDays: number;
  status: "ok" | "insufficient_data" | "error";
  message?: string;
  nObservations: number;
  nUsed: number;
  observationStart: string | null;
  observationEnd: string | null;
  predictors: PredictorResult[];
  ols: {
    intercept: number;
    r2: number;
    n: number;
  } | null;
  documentId?: string;
}

interface AlignedRow {
  observedAt: Date;
  y: number;
  x: Array<number | null>;
}

async function alignRows(spec: CorrelationSpec): Promise<{ targets: number; rows: AlignedRow[] }> {
  const targets = await spec.loadTargets();
  const rows: AlignedRow[] = [];
  for (const t of targets) {
    const x: Array<number | null> = [];
    for (const p of spec.predictors) {
      try {
        x.push(await p.compute(t.observedAt));
      } catch {
        x.push(null);
      }
    }
    rows.push({ observedAt: t.observedAt, y: t.value, x });
  }
  return { targets: targets.length, rows };
}

function buildContent(spec: CorrelationSpec, run: RegressionRunResult): string {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`# Correlation analysis — ${spec.title}`);
  lines.push("");
  lines.push(`Run date: ${today}  ·  Goal area: \`${spec.goalArea}\`  ·  Spec: \`${spec.slug}\`  ·  Window: ${spec.windowDays}d`);
  lines.push("");
  lines.push(`Status: **${run.status}**${run.message ? ` — ${run.message}` : ""}`);
  lines.push("");
  lines.push(`Target observations available: ${run.nObservations}  ·  Used after dropping nulls: ${run.nUsed}`);
  if (run.observationStart && run.observationEnd) {
    lines.push(`Observation range: ${run.observationStart} → ${run.observationEnd}`);
  }
  lines.push("");
  lines.push("## Predictors");
  lines.push("");
  lines.push("| Predictor | Description | n | Pearson r | OLS β |");
  lines.push("|---|---|---|---|---|");
  for (const p of run.predictors) {
    const r = p.pearsonR === null ? "n/a" : p.pearsonR.toFixed(3);
    const beta = p.coefficient === null ? "n/a" : p.coefficient.toFixed(4);
    lines.push(`| ${p.name} | ${p.description} | ${p.nNonNull} | ${r} | ${beta} |`);
  }
  lines.push("");
  if (run.ols) {
    lines.push("## OLS fit");
    lines.push("");
    lines.push(`- Intercept: ${run.ols.intercept.toFixed(4)}`);
    lines.push(`- R²: ${run.ols.r2.toFixed(3)}`);
    lines.push(`- n: ${run.ols.n}`);
  } else {
    lines.push("_OLS not fitted — see status above._");
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("Coefficients and ranges are descriptive, not causal. Small-N fits are unstable;");
  lines.push("interpret as direction-of-association at best until n grows beyond ~20.");
  return lines.join("\n");
}

export async function runSpec(spec: CorrelationSpec, opts?: { persist?: boolean }): Promise<RegressionRunResult> {
  const persist = opts?.persist ?? true;
  let aligned: { targets: number; rows: AlignedRow[] };
  try {
    aligned = await alignRows(spec);
  } catch (err) {
    return {
      slug: spec.slug,
      goalArea: spec.goalArea,
      title: spec.title,
      windowDays: spec.windowDays,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      nObservations: 0,
      nUsed: 0,
      observationStart: null,
      observationEnd: null,
      predictors: spec.predictors.map((p) => ({ name: p.name, description: p.description, pearsonR: null, coefficient: null, nNonNull: 0 })),
      ols: null,
    };
  }

  const usable = aligned.rows.filter((r) => r.x.every((v) => v !== null && Number.isFinite(v)));
  const dates = aligned.rows.map((r) => r.observedAt.toISOString().slice(0, 10));
  const observationStart = dates.length ? dates[0] : null;
  const observationEnd = dates.length ? dates[dates.length - 1] : null;

  const predictors: PredictorResult[] = spec.predictors.map((p, idx) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const row of aligned.rows) {
      const v = row.x[idx];
      if (v !== null && Number.isFinite(v)) {
        xs.push(v as number);
        ys.push(row.y);
      }
    }
    const r = pearson(xs, ys);
    return {
      name: p.name,
      description: p.description,
      pearsonR: r ? r.r : null,
      coefficient: null,
      nNonNull: xs.length,
    };
  });

  let ols: OLSResult | null = null;
  let status: RegressionRunResult["status"] = "ok";
  let message: string | undefined;

  if (usable.length < spec.minObservations) {
    status = "insufficient_data";
    message = `n=${usable.length} after dropping nulls; need ${spec.minObservations}`;
  } else {
    const X = usable.map((r) => r.x as number[]);
    const y = usable.map((r) => r.y);
    ols = linearRegression(X, y);
    if (!ols) {
      status = "insufficient_data";
      message = `OLS could not be fit (singular system or n <= p+1; n=${usable.length}, p=${spec.predictors.length})`;
    } else {
      for (let i = 0; i < spec.predictors.length; i++) {
        predictors[i].coefficient = ols.coefficients[i] ?? null;
      }
    }
  }

  const result: RegressionRunResult = {
    slug: spec.slug,
    goalArea: spec.goalArea,
    title: spec.title,
    windowDays: spec.windowDays,
    status,
    message,
    nObservations: aligned.targets,
    nUsed: usable.length,
    observationStart,
    observationEnd,
    predictors,
    ols: ols ? { intercept: ols.intercept, r2: ols.r2, n: ols.n } : null,
  };

  if (persist) {
    const doc = await createDocument({
      domain: spec.goalArea,
      type: "analysis",
      title: `${spec.title} — ${new Date().toISOString().slice(0, 10)}`,
      content: buildContent(spec, result),
      source: "claude",
      canonicalFor: undefined,
      metadata: {
        kind: "correlation_run",
        spec: spec.slug,
        goalArea: spec.goalArea,
        windowDays: spec.windowDays,
        status: result.status,
        message: result.message ?? null,
        nObservations: result.nObservations,
        nUsed: result.nUsed,
        observationStart: result.observationStart,
        observationEnd: result.observationEnd,
        predictors: result.predictors,
        ols: result.ols,
        canonicalTopics: spec.canonicalTopics ?? [],
        runAt: new Date().toISOString(),
      },
    });
    result.documentId = doc.id;
  }

  return result;
}

export async function runAllSpecs(opts?: { persist?: boolean }): Promise<RegressionRunResult[]> {
  const out: RegressionRunResult[] = [];
  for (const spec of CORRELATION_SPECS) {
    out.push(await runSpec(spec, opts));
  }
  return out;
}

export function listSpecs() {
  return CORRELATION_SPECS.map((s) => ({
    slug: s.slug,
    goalArea: s.goalArea,
    title: s.title,
    windowDays: s.windowDays,
    minObservations: s.minObservations,
    predictors: s.predictors.map((p) => ({ name: p.name, description: p.description })),
    canonicalTopics: s.canonicalTopics ?? [],
  }));
}

export { getSpec };
