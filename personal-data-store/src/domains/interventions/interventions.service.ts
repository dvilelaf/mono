import { db } from "../../db/index.js";
import { interventions, interventionObservations } from "./interventions.schema.js";
import { healthMetrics } from "../health/health.schema.js";
import { transactions } from "../finance/finance.schema.js";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export type InterventionType = "supplement" | "protocol" | "habit" | "financial" | "other";
export type InterventionStatus = "active" | "paused" | "completed" | "abandoned";

export interface CreateInterventionInput {
  slug: string;
  title: string;
  domain: string;
  type: InterventionType | string;
  status?: InterventionStatus | string;
  startDate: string;
  endDate?: string | null;
  hypothesis?: string;
  affectedMetrics?: string[];
  affectedGoals?: string[];
  metricSource?: string;
  protocol?: string;
  windowDays?: number;
  canonicalTopics?: string[];
  notes?: string;
}

export interface UpdateInterventionInput extends Partial<CreateInterventionInput> {
  status?: string;
}

const num = (v: number | null | undefined): string | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : String(v);

export async function listInterventions(filters?: { status?: string; domain?: string }) {
  const conds = [];
  if (filters?.status) conds.push(eq(interventions.status, filters.status));
  if (filters?.domain) conds.push(eq(interventions.domain, filters.domain));
  const q = db.select().from(interventions);
  const rows = conds.length
    ? await q.where(and(...conds)).orderBy(desc(interventions.startDate))
    : await q.orderBy(desc(interventions.startDate));
  return rows;
}

export async function getInterventionBySlug(slug: string) {
  const [row] = await db.select().from(interventions).where(eq(interventions.slug, slug)).limit(1);
  return row ?? null;
}

export async function getInterventionById(id: string) {
  const [row] = await db.select().from(interventions).where(eq(interventions.id, id)).limit(1);
  return row ?? null;
}

export async function createIntervention(input: CreateInterventionInput) {
  const [row] = await db
    .insert(interventions)
    .values({
      slug: input.slug,
      title: input.title,
      domain: input.domain,
      type: input.type,
      status: input.status ?? "active",
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      hypothesis: input.hypothesis ?? null,
      affectedMetrics: input.affectedMetrics ?? null,
      affectedGoals: input.affectedGoals ?? null,
      metricSource: input.metricSource ?? null,
      protocol: input.protocol ?? null,
      windowDays: input.windowDays ?? 28,
      canonicalTopics: input.canonicalTopics ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}

export async function updateIntervention(slug: string, input: UpdateInterventionInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.domain !== undefined) patch.domain = input.domain;
  if (input.type !== undefined) patch.type = input.type;
  if (input.status !== undefined) patch.status = input.status;
  if (input.startDate !== undefined) patch.startDate = new Date(input.startDate);
  if (input.endDate !== undefined) patch.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.hypothesis !== undefined) patch.hypothesis = input.hypothesis;
  if (input.affectedMetrics !== undefined) patch.affectedMetrics = input.affectedMetrics;
  if (input.affectedGoals !== undefined) patch.affectedGoals = input.affectedGoals;
  if (input.metricSource !== undefined) patch.metricSource = input.metricSource;
  if (input.protocol !== undefined) patch.protocol = input.protocol;
  if (input.windowDays !== undefined) patch.windowDays = input.windowDays;
  if (input.canonicalTopics !== undefined) patch.canonicalTopics = input.canonicalTopics;
  if (input.notes !== undefined) patch.notes = input.notes;
  const [row] = await db.update(interventions).set(patch).where(eq(interventions.slug, slug)).returning();
  return row ?? null;
}

export async function listObservations(interventionId: string, limit = 90) {
  return db
    .select()
    .from(interventionObservations)
    .where(eq(interventionObservations.interventionId, interventionId))
    .orderBy(desc(interventionObservations.observedAt))
    .limit(limit);
}

export async function listObservationsByMetric(interventionId: string, metricName: string, limit = 30) {
  return db
    .select()
    .from(interventionObservations)
    .where(and(
      eq(interventionObservations.interventionId, interventionId),
      eq(interventionObservations.metricName, metricName),
    ))
    .orderBy(desc(interventionObservations.observedAt))
    .limit(limit);
}

export async function listLatestObservationsForAll() {
  // One latest observation per (interventionId, metricName).
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (intervention_id, metric_name) *
    FROM intervention_observations
    ORDER BY intervention_id, metric_name, observed_at DESC
  `);
  const list = (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (rows as unknown as Array<Record<string, unknown>>);
  return list ?? [];
}

interface MetricStats {
  mean: number | null;
  count: number;
}

async function statsForHealthMetric(metricName: string, source: string | null, since: Date, until: Date): Promise<MetricStats> {
  const conds = [
    eq(healthMetrics.metricType, metricName),
    gte(healthMetrics.recordedAt, since),
    lte(healthMetrics.recordedAt, until),
  ];
  if (source) conds.push(eq(healthMetrics.source, source));
  const [row] = await db
    .select({
      mean: sql<string>`avg(${healthMetrics.value})`,
      count: sql<string>`count(*)`,
    })
    .from(healthMetrics)
    .where(and(...conds));
  const mean = row?.mean ? Number(row.mean) : null;
  const count = row?.count ? Number(row.count) : 0;
  return { mean: Number.isFinite(mean as number) ? mean : null, count };
}

async function statsForFinancialMetric(metricName: string, since: Date, until: Date): Promise<MetricStats> {
  // Limited support: spend.gbp_30d_avg style or unknown. Skip if not understood.
  if (metricName === "monthly_spend_gbp") {
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = until.toISOString().slice(0, 10);
    const [row] = await db
      .select({ total: sql<string>`coalesce(abs(sum(${transactions.amount})), 0)` })
      .from(transactions)
      .where(and(
        sql`${transactions.date} >= ${sinceStr}`,
        sql`${transactions.date} <= ${untilStr}`,
        sql`${transactions.amount} < 0`,
        eq(transactions.currency, "GBP"),
      ));
    const total = row?.total ? Number(row.total) : 0;
    const days = Math.max(1, Math.ceil((until.getTime() - since.getTime()) / 86400_000));
    return { mean: total * (30 / days), count: 1 };
  }
  return { mean: null, count: 0 };
}

export async function computeMetricStats(
  metricName: string,
  source: string | null,
  since: Date,
  until: Date,
): Promise<MetricStats> {
  const finance = await statsForFinancialMetric(metricName, since, until);
  if (finance.mean !== null) return finance;
  return statsForHealthMetric(metricName, source, since, until);
}

export interface MetricEvaluation {
  metricName: string;
  source: string | null;
  windowDays: number;
  valueBefore: number | null;
  valueAfter: number | null;
  delta: number | null;
  deltaPct: number | null;
  nBefore: number;
  nAfter: number;
}

export async function evaluateIntervention(interventionId: string): Promise<MetricEvaluation[]> {
  const intervention = await getInterventionById(interventionId);
  if (!intervention) return [];
  const metrics = (intervention.affectedMetrics ?? []) as string[];
  if (metrics.length === 0) return [];
  const window = intervention.windowDays ?? 28;
  const start = new Date(intervention.startDate);
  const beforeUntil = new Date(start.getTime() - 1);
  const beforeSince = new Date(start.getTime() - window * 86400_000);
  const afterUntil = intervention.endDate ? new Date(intervention.endDate) : new Date();
  const afterSince = new Date(Math.max(start.getTime(), afterUntil.getTime() - window * 86400_000));
  const source = intervention.metricSource ?? null;
  const evaluations: MetricEvaluation[] = [];
  const observedAt = new Date();

  for (const metricName of metrics) {
    const before = await computeMetricStats(metricName, source, beforeSince, beforeUntil);
    const after = await computeMetricStats(metricName, source, afterSince, afterUntil);
    let delta: number | null = null;
    let deltaPct: number | null = null;
    if (before.mean !== null && after.mean !== null) {
      delta = after.mean - before.mean;
      deltaPct = before.mean !== 0 ? (delta / Math.abs(before.mean)) * 100 : null;
    }
    evaluations.push({
      metricName,
      source,
      windowDays: window,
      valueBefore: before.mean,
      valueAfter: after.mean,
      delta,
      deltaPct,
      nBefore: before.count,
      nAfter: after.count,
    });

    await db.insert(interventionObservations).values({
      interventionId,
      metricName,
      metricSource: source,
      valueBefore: num(before.mean),
      valueAfter: num(after.mean),
      delta: num(delta),
      deltaPct: num(deltaPct),
      nBefore: before.count,
      nAfter: after.count,
      windowDays: window,
      observedAt,
    });
  }

  return evaluations;
}

export async function evaluateInterventionBySlug(slug: string): Promise<MetricEvaluation[] | null> {
  const intervention = await getInterventionBySlug(slug);
  if (!intervention) return null;
  return evaluateIntervention(intervention.id);
}

export async function listInterventionsByGoalSlug(goalSlug: string) {
  return db
    .select()
    .from(interventions)
    .where(sql`${interventions.affectedGoals} && ARRAY[${goalSlug}]::text[]`)
    .orderBy(desc(interventions.startDate));
}
