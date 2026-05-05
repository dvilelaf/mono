import { db } from "../../db/index.js";
import { goals, goalObservations } from "./goals.schema.js";
import { healthMetrics } from "../health/health.schema.js";
import { eq, desc, and, gte, sql } from "drizzle-orm";

export type MetricSource =
  | { kind: "metric"; metricType: string; source?: string; agg?: "latest" | "avg_28d" | "count_28d" | "count_7d" }
  | { kind: "sql"; query: string }
  | { kind: "static"; value: number };

export interface CreateGoalInput {
  slug: string;
  title: string;
  domain: string;
  metricSource: MetricSource;
  targetValue?: number;
  targetRangeLow?: number;
  targetRangeHigh?: number;
  targetDirection: "above" | "below" | "range";
  targetDate?: string;
  unit?: string;
  priority?: number;
  canonicalTopics?: string[];
  notes?: string;
  narrativeDocId?: string;
}

export interface UpdateGoalInput extends Partial<CreateGoalInput> {
  currentValue?: number | null;
  previousValue?: number | null;
  status?: string;
  eta?: string | null;
}

const num = (v: number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

export async function listGoals() {
  return db.select().from(goals).orderBy(desc(goals.priority), goals.domain);
}

export async function getGoalBySlug(slug: string) {
  const [row] = await db.select().from(goals).where(eq(goals.slug, slug)).limit(1);
  return row ?? null;
}

export async function getGoalById(id: string) {
  const [row] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  return row ?? null;
}

export async function createGoal(input: CreateGoalInput) {
  const [row] = await db
    .insert(goals)
    .values({
      slug: input.slug,
      title: input.title,
      domain: input.domain,
      metricSource: input.metricSource as unknown as Record<string, unknown>,
      targetValue: num(input.targetValue),
      targetRangeLow: num(input.targetRangeLow),
      targetRangeHigh: num(input.targetRangeHigh),
      targetDirection: input.targetDirection,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      unit: input.unit ?? null,
      priority: input.priority ?? 3,
      canonicalTopics: input.canonicalTopics ?? null,
      notes: input.notes ?? null,
      narrativeDocId: input.narrativeDocId ?? null,
    })
    .returning();
  return row;
}

export async function updateGoal(slug: string, input: UpdateGoalInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.domain !== undefined) patch.domain = input.domain;
  if (input.metricSource !== undefined) patch.metricSource = input.metricSource;
  if (input.targetValue !== undefined) patch.targetValue = num(input.targetValue);
  if (input.targetRangeLow !== undefined) patch.targetRangeLow = num(input.targetRangeLow);
  if (input.targetRangeHigh !== undefined) patch.targetRangeHigh = num(input.targetRangeHigh);
  if (input.targetDirection !== undefined) patch.targetDirection = input.targetDirection;
  if (input.targetDate !== undefined) patch.targetDate = input.targetDate ? new Date(input.targetDate) : null;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.canonicalTopics !== undefined) patch.canonicalTopics = input.canonicalTopics;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.narrativeDocId !== undefined) patch.narrativeDocId = input.narrativeDocId;
  if (input.currentValue !== undefined) patch.currentValue = num(input.currentValue ?? undefined);
  if (input.previousValue !== undefined) patch.previousValue = num(input.previousValue ?? undefined);
  if (input.status !== undefined) patch.status = input.status;
  if (input.eta !== undefined) patch.eta = input.eta ? new Date(input.eta) : null;
  const [row] = await db.update(goals).set(patch).where(eq(goals.slug, slug)).returning();
  return row ?? null;
}

export async function listObservations(goalId: string, limit = 90) {
  return db
    .select()
    .from(goalObservations)
    .where(eq(goalObservations.goalId, goalId))
    .orderBy(desc(goalObservations.observedAt))
    .limit(limit);
}

export async function recordObservation(params: {
  goalId: string;
  observedValue: number;
  observedAt?: Date;
  notes?: string;
  trajectory?: string;
  deltaFromPrevious?: number | null;
}) {
  const [row] = await db
    .insert(goalObservations)
    .values({
      goalId: params.goalId,
      observedValue: String(params.observedValue),
      observedAt: params.observedAt ?? new Date(),
      notes: params.notes ?? null,
      trajectory: params.trajectory ?? null,
      deltaFromPrevious: params.deltaFromPrevious === null || params.deltaFromPrevious === undefined ? null : String(params.deltaFromPrevious),
    })
    .returning();
  return row;
}

export async function probeMetricSource(source: MetricSource): Promise<number | null> {
  if (source.kind === "static") return source.value;
  if (source.kind === "metric") {
    const agg = source.agg ?? "latest";
    const conds = [eq(healthMetrics.metricType, source.metricType)];
    if (source.source) conds.push(eq(healthMetrics.source, source.source));
    if (agg === "latest") {
      const [row] = await db
        .select()
        .from(healthMetrics)
        .where(and(...conds))
        .orderBy(desc(healthMetrics.recordedAt))
        .limit(1);
      return row ? Number(row.value) : null;
    }
    const since = new Date(Date.now() - (agg === "count_7d" ? 7 : 28) * 86400_000);
    conds.push(gte(healthMetrics.recordedAt, since));
    if (agg === "avg_28d") {
      const [row] = await db
        .select({ avg: sql<string>`avg(${healthMetrics.value})` })
        .from(healthMetrics)
        .where(and(...conds));
      return row?.avg ? Number(row.avg) : null;
    }
    if (agg === "count_28d" || agg === "count_7d") {
      const [row] = await db
        .select({ count: sql<string>`count(*)` })
        .from(healthMetrics)
        .where(and(...conds));
      return row?.count ? Number(row.count) : 0;
    }
  }
  if (source.kind === "sql") {
    const trimmed = source.query.trim().replace(/;$/, "");
    if (!/^select\b/i.test(trimmed)) {
      throw new Error("metric_source.kind=sql must start with SELECT");
    }
    if (/\b(insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i.test(trimmed)) {
      throw new Error("metric_source.kind=sql contains forbidden keyword");
    }
    const result = await db.execute(sql.raw(trimmed));
    const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows
      ?? (result as unknown as Array<Record<string, unknown>>);
    if (!rows || rows.length === 0) return null;
    const first = rows[0];
    const firstKey = Object.keys(first)[0];
    const value = first[firstKey];
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function deriveStatus(goal: typeof goals.$inferSelect, current: number | null): string {
  if (current === null) return "unknown";
  const dir = goal.targetDirection;
  if (dir === "above" && goal.targetValue !== null) {
    const target = Number(goal.targetValue);
    if (current >= target) return "achieved";
    return current >= target * 0.9 ? "on_track" : current >= target * 0.7 ? "at_risk" : "off_track";
  }
  if (dir === "below" && goal.targetValue !== null) {
    const target = Number(goal.targetValue);
    if (current <= target) return "achieved";
    return current <= target * 1.1 ? "on_track" : current <= target * 1.3 ? "at_risk" : "off_track";
  }
  if (dir === "range" && goal.targetRangeLow !== null && goal.targetRangeHigh !== null) {
    const lo = Number(goal.targetRangeLow);
    const hi = Number(goal.targetRangeHigh);
    if (current >= lo && current <= hi) return "achieved";
    const margin = (hi - lo) * 0.2;
    if (current >= lo - margin && current <= hi + margin) return "at_risk";
    return "off_track";
  }
  return "unknown";
}

export function deriveTrajectory(prev: number | null, current: number | null, dir: string): "improving" | "declining" | "stable" {
  if (prev === null || current === null) return "stable";
  const delta = current - prev;
  if (Math.abs(delta) < Math.abs(prev) * 0.01) return "stable";
  if (dir === "above") return delta > 0 ? "improving" : "declining";
  if (dir === "below") return delta < 0 ? "improving" : "declining";
  return "stable";
}

export async function computeEta(goalId: string, target: number | null, dir: string): Promise<Date | null> {
  if (target === null) return null;
  const recent = await db
    .select()
    .from(goalObservations)
    .where(eq(goalObservations.goalId, goalId))
    .orderBy(desc(goalObservations.observedAt))
    .limit(20);
  if (recent.length < 3) return null;
  const points = recent
    .map((o) => ({ t: new Date(o.observedAt).getTime(), v: Number(o.observedValue) }))
    .sort((a, b) => a.t - b.t);
  const n = points.length;
  const meanT = points.reduce((s, p) => s + p.t, 0) / n;
  const meanV = points.reduce((s, p) => s + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.v - meanV);
    den += (p.t - meanT) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  if (slope === 0) return null;
  const last = points[n - 1];
  if (dir === "above" && last.v >= target) return null;
  if (dir === "below" && last.v <= target) return null;
  const tEta = last.t + (target - last.v) / slope;
  if (!Number.isFinite(tEta) || tEta < last.t) return null;
  if (tEta > Date.now() + 365 * 5 * 86400_000) return null;
  return new Date(tEta);
}
