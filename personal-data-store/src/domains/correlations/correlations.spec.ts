import { db } from "../../db/index.js";
import { sql } from "drizzle-orm";

// A correlation spec defines a regression model for a goal area.
// The runner pulls target observations and aligns predictor values via SQL
// against a window ending at each observation date.

export interface TargetObservation {
  observedAt: Date;
  value: number;
}

export interface PredictorValueFn {
  (observedAt: Date): Promise<number | null>;
}

export interface PredictorSpec {
  name: string;
  description: string;
  compute: PredictorValueFn;
}

export interface CorrelationSpec {
  slug: string;            // e.g. "cardiovascular-apob"
  goalArea: string;        // e.g. "cardiovascular" — also used as document domain
  title: string;
  windowDays: number;
  minObservations: number;
  loadTargets(): Promise<TargetObservation[]>;
  predictors: PredictorSpec[];
  canonicalTopics?: string[];
}

// ---------------------------------------------------------------------------
// Shared SQL helpers (parameterise on the observation date).
// ---------------------------------------------------------------------------

async function avgMetricInWindow(metricTypePattern: string, observedAt: Date, windowDays: number): Promise<number | null> {
  const rows = await db.execute<{ avg: string | null }>(sql`
    SELECT AVG(value)::text AS avg
    FROM health_metrics
    WHERE metric_type ILIKE ${metricTypePattern}
      AND recorded_at <= ${observedAt}
      AND recorded_at > ${observedAt} - (${windowDays}::int * INTERVAL '1 day')
  `);
  const avg = (rows as unknown as Array<{ avg: string | null }>)[0]?.avg;
  if (avg === null || avg === undefined) return null;
  const n = Number(avg);
  return Number.isFinite(n) ? n : null;
}

async function latestMetricBefore(metricTypePattern: string, observedAt: Date): Promise<number | null> {
  const rows = await db.execute<{ value: string }>(sql`
    SELECT value::text AS value
    FROM health_metrics
    WHERE metric_type ILIKE ${metricTypePattern}
      AND recorded_at <= ${observedAt}
    ORDER BY recorded_at DESC
    LIMIT 1
  `);
  const v = (rows as unknown as Array<{ value: string }>)[0]?.value;
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function workoutCountInWindow(observedAt: Date, windowDays: number): Promise<number> {
  const rows = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM workouts
    WHERE started_at <= ${observedAt}
      AND started_at > ${observedAt} - (${windowDays}::int * INTERVAL '1 day')
  `);
  const c = (rows as unknown as Array<{ count: string }>)[0]?.count ?? "0";
  return Number(c);
}

async function adherenceScoreInWindow(observedAt: Date, windowDays: number): Promise<number | null> {
  // Fraction of days in window where at least one supplement check-in was recorded.
  // Returns null if the window pre-dates check-in adoption (no rows at all).
  const rows = await db.execute<{ days: string; misses: string }>(sql`
    WITH window_days AS (
      SELECT generate_series(
        (date_trunc('day', ${observedAt}::timestamptz) - (${windowDays}::int - 1) * INTERVAL '1 day')::date,
        date_trunc('day', ${observedAt}::timestamptz)::date,
        INTERVAL '1 day'
      )::date AS day
    ),
    taken_days AS (
      SELECT DISTINCT (taken_at AT TIME ZONE 'UTC')::date AS day
      FROM supplements
      WHERE source = 'checkin'
        AND taken_at <= ${observedAt}
        AND taken_at > ${observedAt} - (${windowDays}::int * INTERVAL '1 day')
    ),
    misses AS (
      SELECT COUNT(*)::text AS c
      FROM adherence_misses
      WHERE miss_date <= date_trunc('day', ${observedAt}::timestamptz)::date
        AND miss_date > date_trunc('day', ${observedAt}::timestamptz)::date - (${windowDays}::int - 1)
    )
    SELECT
      (SELECT COUNT(*)::text FROM taken_days) AS days,
      (SELECT c FROM misses) AS misses
  `);
  const r = (rows as unknown as Array<{ days: string; misses: string }>)[0];
  if (!r) return null;
  const taken = Number(r.days ?? "0");
  const missed = Number(r.misses ?? "0");
  if (taken === 0 && missed === 0) return null; // no signal in window
  return Math.max(0, Math.min(1, taken / windowDays));
}

async function workoutEnergyOnPriorDay(observedAt: Date): Promise<number | null> {
  // Sum of active_energy across workouts that started on the prior calendar day (UTC).
  const rows = await db.execute<{ total: string | null }>(sql`
    SELECT COALESCE(SUM(active_energy), 0)::text AS total
    FROM workouts
    WHERE (started_at AT TIME ZONE 'UTC')::date
      = (date_trunc('day', ${observedAt}::timestamptz)::date - INTERVAL '1 day')::date
  `);
  const t = (rows as unknown as Array<{ total: string | null }>)[0]?.total;
  if (t === null || t === undefined) return null;
  return Number(t);
}

async function loadHealthMetricSeries(metricTypePattern: string, sourceFilter?: string): Promise<TargetObservation[]> {
  const rows = sourceFilter
    ? await db.execute(sql`
        SELECT recorded_at, value::text AS value
        FROM health_metrics
        WHERE metric_type ILIKE ${metricTypePattern}
          AND source = ${sourceFilter}
        ORDER BY recorded_at ASC
      `)
    : await db.execute(sql`
        SELECT recorded_at, value::text AS value
        FROM health_metrics
        WHERE metric_type ILIKE ${metricTypePattern}
        ORDER BY recorded_at ASC
      `);
  return (rows as unknown as Array<{ recorded_at: string | Date; value: string }>).map((r) => ({
    observedAt: r.recorded_at instanceof Date ? r.recorded_at : new Date(r.recorded_at),
    value: Number(r.value),
  })).filter((r) => Number.isFinite(r.value));
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

const cardiovascularApoB: CorrelationSpec = {
  slug: "cardiovascular-apob",
  goalArea: "cardiovascular",
  title: "ApoB ~ adherence + steps + workouts + body fat (28d window)",
  windowDays: 28,
  minObservations: 4,
  canonicalTopics: ["goals.cardiovascular"],
  async loadTargets() {
    return loadHealthMetricSeries("%apob%");
  },
  predictors: [
    {
      name: "adherence_score_28d",
      description: "Fraction of days in the prior 28d with at least one supplement check-in",
      compute: (d) => adherenceScoreInWindow(d, 28),
    },
    {
      name: "steps_avg_28d",
      description: "Mean daily step count over prior 28d",
      compute: (d) => avgMetricInWindow("steps", d, 28),
    },
    {
      name: "workout_count_28d",
      description: "Workouts started in prior 28d",
      compute: async (d) => workoutCountInWindow(d, 28),
    },
    {
      name: "body_fat_pct_latest",
      description: "Most recent body-fat percentage on or before observation",
      compute: (d) => latestMetricBefore("%body_fat%", d),
    },
  ],
};

const sleepScore: CorrelationSpec = {
  slug: "sleep-score-drivers",
  goalArea: "sleep",
  title: "Sleep score ~ workout intensity yesterday + steps avg 7d (Aura)",
  windowDays: 7,
  minObservations: 7,
  canonicalTopics: ["goals.sleep"],
  async loadTargets() {
    return loadHealthMetricSeries("sleep_score", "aura");
  },
  predictors: [
    {
      name: "workout_energy_yesterday",
      description: "Sum of workout active_energy on the prior calendar day (UTC)",
      compute: (d) => workoutEnergyOnPriorDay(d),
    },
    {
      name: "steps_avg_7d",
      description: "Mean daily step count over prior 7d",
      compute: (d) => avgMetricInWindow("steps", d, 7),
    },
  ],
};

export const CORRELATION_SPECS: CorrelationSpec[] = [cardiovascularApoB, sleepScore];

export function getSpec(slug: string): CorrelationSpec | undefined {
  return CORRELATION_SPECS.find((s) => s.slug === slug);
}
