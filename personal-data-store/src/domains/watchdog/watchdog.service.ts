import { db } from "../../db/index.js";
import { watchdogAlerts } from "./watchdog.schema.js";
import { connectorRuns } from "../../system/system.schema.js";
import { healthMetrics } from "../health/health.schema.js";
import { workouts } from "../health/health.schema.js";
import { transactions } from "../finance/finance.schema.js";
import { yieldPositions } from "../finance/yield-positions.schema.js";
import { goals } from "../goals/goals.schema.js";
import { eq, and, desc, sql } from "drizzle-orm";

export type Severity = "info" | "warning" | "critical";

export interface AlertInput {
  checkType: string;
  severity: Severity;
  subject: string;
  title: string;
  detail?: string;
  fingerprint: string;
  metadata?: Record<string, unknown>;
}

export interface UpsertResult {
  inserted: boolean;
  alert: typeof watchdogAlerts.$inferSelect;
}

// Insert if no open alert with this fingerprint exists. Returns whether a new
// alert row was created (so the connector can decide to send ntfy).
export async function upsertAlert(input: AlertInput): Promise<UpsertResult> {
  const [row] = await db
    .insert(watchdogAlerts)
    .values({
      checkType: input.checkType,
      severity: input.severity,
      subject: input.subject,
      title: input.title,
      detail: input.detail ?? null,
      fingerprint: input.fingerprint,
      metadata: (input.metadata ?? null) as Record<string, unknown> | null,
    })
    .onConflictDoNothing({ target: watchdogAlerts.fingerprint, where: sql`${watchdogAlerts.resolved} = false` })
    .returning();
  if (row) return { inserted: true, alert: row };
  const [existing] = await db
    .select()
    .from(watchdogAlerts)
    .where(and(eq(watchdogAlerts.fingerprint, input.fingerprint), eq(watchdogAlerts.resolved, false)))
    .limit(1);
  return { inserted: false, alert: existing };
}

export async function listAlerts(opts?: { resolved?: boolean; limit?: number }) {
  const limit = opts?.limit ?? 100;
  if (opts?.resolved === undefined) {
    return db
      .select()
      .from(watchdogAlerts)
      .orderBy(desc(watchdogAlerts.createdAt))
      .limit(limit);
  }
  return db
    .select()
    .from(watchdogAlerts)
    .where(eq(watchdogAlerts.resolved, opts.resolved))
    .orderBy(desc(watchdogAlerts.createdAt))
    .limit(limit);
}

export async function resolveAlert(id: string) {
  const [row] = await db
    .update(watchdogAlerts)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(watchdogAlerts.id, id))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------- checks --

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

interface FreshnessSpec {
  source: string;
  table: "health_metrics" | "workouts" | "transactions" | "connector_runs";
  maxStaleMs: number;
  severity: Severity; // severity if stale beyond max
  label: string;
}

// Stale thresholds chosen pragmatically: webhook sources alert fast, periodic
// sources alert slower. Tweakable here without schema changes.
const FRESHNESS_SPECS: FreshnessSpec[] = [
  { source: "apple_health", table: "health_metrics", maxStaleMs: 36 * HOUR, severity: "critical", label: "Apple Health" },
  { source: "aura", table: "health_metrics", maxStaleMs: 12 * HOUR, severity: "warning", label: "Oura" },
  { source: "strong", table: "workouts", maxStaleMs: 14 * DAY, severity: "warning", label: "Strong (workouts)" },
  { source: "wise", table: "transactions", maxStaleMs: 5 * DAY, severity: "warning", label: "Wise" },
  { source: "revolut", table: "transactions", maxStaleMs: 5 * DAY, severity: "warning", label: "Revolut" },
];

interface CheckResult {
  alerts: AlertInput[];
}

export async function checkDataFreshness(): Promise<CheckResult> {
  const alerts: AlertInput[] = [];
  const now = Date.now();
  const todayKey = new Date(now).toISOString().slice(0, 10);

  for (const spec of FRESHNESS_SPECS) {
    let last: Date | null = null;
    if (spec.table === "health_metrics") {
      const [row] = await db
        .select({ ts: sql<Date>`max(${healthMetrics.recordedAt})` })
        .from(healthMetrics)
        .where(eq(healthMetrics.source, spec.source));
      last = row?.ts ? new Date(row.ts) : null;
    } else if (spec.table === "workouts") {
      const [row] = await db
        .select({ ts: sql<Date>`max(${workouts.startedAt})` })
        .from(workouts)
        .where(eq(workouts.source, spec.source));
      last = row?.ts ? new Date(row.ts) : null;
    } else if (spec.table === "transactions") {
      const [row] = await db
        .select({ ts: sql<Date>`max(${transactions.date})` })
        .from(transactions)
        .where(eq(transactions.source, spec.source));
      last = row?.ts ? new Date(row.ts) : null;
    }

    if (!last) continue; // never had data — don't alert until we've seen at least one record
    const ageMs = now - last.getTime();
    if (ageMs <= spec.maxStaleMs) continue;
    const days = Math.floor(ageMs / DAY);
    const hours = Math.floor((ageMs % DAY) / HOUR);
    const ageStr = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    alerts.push({
      checkType: "data_freshness",
      severity: spec.severity,
      subject: spec.source,
      title: `${spec.label} stale (${ageStr})`,
      detail: `Last record at ${last.toISOString()} — expected within ${formatMs(spec.maxStaleMs)}.`,
      fingerprint: `freshness:${spec.source}:${todayKey}`,
      metadata: { lastSeenAt: last.toISOString(), ageMs, maxStaleMs: spec.maxStaleMs },
    });
  }
  return { alerts };
}

function formatMs(ms: number): string {
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
  return `${hours}h`;
}

interface MetricDriftSpec {
  metricType: string;
  source: string;
  threshold: number; // fractional change threshold (0.15 = 15%)
  severity: Severity;
  label: string;
  windowDays: number;
}

const DRIFT_SPECS: MetricDriftSpec[] = [
  { metricType: "resting_heart_rate", source: "apple_health", threshold: 0.15, severity: "warning", label: "Resting HR", windowDays: 7 },
  { metricType: "weight", source: "apple_health", threshold: 0.03, severity: "warning", label: "Weight", windowDays: 7 },
  { metricType: "weight", source: "checkin", threshold: 0.03, severity: "warning", label: "Weight (check-in)", windowDays: 7 },
];

export async function checkMetricDrift(): Promise<CheckResult> {
  const alerts: AlertInput[] = [];
  const now = Date.now();
  const todayKey = new Date(now).toISOString().slice(0, 10);

  for (const spec of DRIFT_SPECS) {
    // latest reading
    const [latest] = await db
      .select()
      .from(healthMetrics)
      .where(and(eq(healthMetrics.metricType, spec.metricType), eq(healthMetrics.source, spec.source)))
      .orderBy(desc(healthMetrics.recordedAt))
      .limit(1);
    if (!latest) continue;
    const latestTs = new Date(latest.recordedAt).getTime();
    if (now - latestTs > 3 * DAY) continue; // skip if reading is itself stale; freshness check covers that

    // baseline: average of prior `windowDays` excluding the latest reading
    const windowStart = new Date(latestTs - spec.windowDays * DAY);
    const [baseline] = await db
      .select({
        avg: sql<string>`avg(${healthMetrics.value})`,
        n: sql<string>`count(*)`,
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.metricType, spec.metricType),
          eq(healthMetrics.source, spec.source),
          sql`${healthMetrics.recordedAt} >= ${windowStart.toISOString()}`,
          sql`${healthMetrics.recordedAt} < ${new Date(latestTs).toISOString()}`,
        ),
      );
    const baselineN = Number(baseline?.n ?? "0");
    const baselineAvg = baseline?.avg ? Number(baseline.avg) : NaN;
    if (!Number.isFinite(baselineAvg) || baselineN < 3) continue;
    const current = Number(latest.value);
    if (!Number.isFinite(current) || baselineAvg === 0) continue;
    const delta = (current - baselineAvg) / baselineAvg;
    if (Math.abs(delta) < spec.threshold) continue;
    const pct = (delta * 100).toFixed(1);
    alerts.push({
      checkType: "metric_drift",
      severity: spec.severity,
      subject: `${spec.source}:${spec.metricType}`,
      title: `${spec.label} drift ${delta >= 0 ? "+" : ""}${pct}%`,
      detail: `Latest ${current}${latest.unit} vs ${spec.windowDays}d mean ${baselineAvg.toFixed(2)}${latest.unit} (n=${baselineN}).`,
      fingerprint: `drift:${spec.source}:${spec.metricType}:${todayKey}`,
      metadata: { current, baselineAvg, baselineN, deltaPct: delta * 100, windowDays: spec.windowDays },
    });
  }
  return { alerts };
}

export async function checkGoalRegression(): Promise<CheckResult> {
  const alerts: AlertInput[] = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const rows = await db.select().from(goals);
  for (const g of rows) {
    if (g.status !== "at_risk" && g.status !== "off_track") continue;
    // Treat as regression alert; fingerprint includes status so it fires once per (goal, status, day).
    const severity: Severity = g.status === "off_track" ? "critical" : "warning";
    alerts.push({
      checkType: "goal_regression",
      severity,
      subject: `goal:${g.slug}`,
      title: `Goal ${g.title}: ${g.status.replace("_", " ")}`,
      detail: `Current ${g.currentValue ?? "n/a"}${g.unit ?? ""} vs target ${g.targetDirection} ${g.targetValue ?? "(range)"}${g.unit ?? ""}.`,
      fingerprint: `goal:${g.slug}:${g.status}:${todayKey}`,
      metadata: {
        slug: g.slug,
        domain: g.domain,
        status: g.status,
        currentValue: g.currentValue,
        previousValue: g.previousValue,
        targetValue: g.targetValue,
        targetDirection: g.targetDirection,
      },
    });
  }
  return { alerts };
}

export async function checkYieldApyDrift(): Promise<CheckResult> {
  const alerts: AlertInput[] = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  // For each (name, protocol, chain, token), get latest 2 snapshots with apy not null.
  // Use a CTE-style query.
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT
        name, protocol, chain, token, apy, snapshot_at,
        ROW_NUMBER() OVER (PARTITION BY name, protocol, chain, token ORDER BY snapshot_at DESC) AS rn
      FROM yield_positions
      WHERE apy IS NOT NULL
    )
    SELECT name, protocol, chain, token,
      MAX(CASE WHEN rn = 1 THEN apy END) AS apy_now,
      MAX(CASE WHEN rn = 1 THEN snapshot_at END) AS at_now,
      MAX(CASE WHEN rn = 2 THEN apy END) AS apy_prev,
      MAX(CASE WHEN rn = 2 THEN snapshot_at END) AS at_prev
    FROM ranked
    WHERE rn <= 2
    GROUP BY name, protocol, chain, token
  `);
  type Row = {
    name: string;
    protocol: string;
    chain: string;
    token: string;
    apy_now: string | null;
    at_now: string | null;
    apy_prev: string | null;
    at_prev: string | null;
  };
  const rows = (result as unknown as { rows?: Row[] }).rows ?? (result as unknown as Row[]);
  for (const r of rows) {
    if (!r.apy_now || !r.apy_prev) continue;
    const now = Number(r.apy_now);
    const prev = Number(r.apy_prev);
    if (!Number.isFinite(now) || !Number.isFinite(prev)) continue;
    // APY is stored as a decimal fraction in many of our positions but some are
    // percent. Normalise: assume any value > 1 is in %, otherwise fractional.
    const toPct = (v: number) => (Math.abs(v) > 1 ? v : v * 100);
    const driftBp = (toPct(now) - toPct(prev)) * 100; // 1pp = 100bp
    if (Math.abs(driftBp) < 50) continue;
    const subject = `yield:${r.protocol}:${r.name}`;
    alerts.push({
      checkType: "yield_apy_drift",
      severity: Math.abs(driftBp) > 200 ? "critical" : "warning",
      subject,
      title: `${r.name} APY drift ${driftBp >= 0 ? "+" : ""}${driftBp.toFixed(0)}bp`,
      detail: `${toPct(prev).toFixed(2)}% → ${toPct(now).toFixed(2)}% on ${r.protocol} (${r.chain}/${r.token}).`,
      fingerprint: `apy:${subject}:${todayKey}`,
      metadata: { apyNow: now, apyPrev: prev, driftBp, atNow: r.at_now, atPrev: r.at_prev },
    });
  }
  return { alerts };
}

export async function checkConnectorFailures(): Promise<CheckResult> {
  const alerts: AlertInput[] = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 24 * HOUR);
  const rows = await db
    .select()
    .from(connectorRuns)
    .where(and(eq(connectorRuns.status, "failed"), sql`${connectorRuns.startedAt} >= ${since.toISOString()}`));
  // group by connector
  const byConnector = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byConnector.get(r.connector) ?? [];
    list.push(r);
    byConnector.set(r.connector, list);
  }
  for (const [connector, list] of byConnector) {
    if (list.length === 0) continue;
    const lastErr = list[0].error ?? "(no error message)";
    const severity: Severity = list.length >= 3 ? "critical" : "warning";
    alerts.push({
      checkType: "connector_failure",
      severity,
      subject: `connector:${connector}`,
      title: `${connector} failed ${list.length}× in last 24h`,
      detail: `Most recent error: ${lastErr.slice(0, 400)}`,
      fingerprint: `connector_fail:${connector}:${todayKey}`,
      metadata: { connector, failureCount: list.length, sampleError: lastErr.slice(0, 1000) },
    });
  }
  return { alerts };
}

export async function runAllChecks(): Promise<{ alerts: AlertInput[] }> {
  const out: AlertInput[] = [];
  for (const fn of [checkDataFreshness, checkMetricDrift, checkGoalRegression, checkYieldApyDrift, checkConnectorFailures]) {
    try {
      const r = await fn();
      out.push(...r.alerts);
    } catch (err) {
      out.push({
        checkType: "watchdog_self",
        severity: "warning",
        subject: fn.name,
        title: `Watchdog check ${fn.name} threw`,
        detail: err instanceof Error ? err.message : String(err),
        fingerprint: `selfcheck:${fn.name}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }
  return { alerts: out };
}
