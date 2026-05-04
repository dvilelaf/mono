import { Router } from "express";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { healthMetrics } from "../domains/health/health.schema.js";

export const appleHealthWebhook = Router();

type HealthMetricRow = typeof healthMetrics.$inferInsert;

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function expandPoint(
  metricType: string,
  unit: string,
  point: Record<string, unknown>
): HealthMetricRow[] {
  const dateRaw = point.date ?? point.startDate ?? point.sleepStart;
  if (typeof dateRaw !== "string" && !(dateRaw instanceof Date)) return [];
  const recordedAt = new Date(dateRaw as string);
  if (Number.isNaN(recordedAt.getTime())) return [];

  const qty = toNumber(point.qty);
  if (qty !== null) {
    return [
      {
        source: "apple_health",
        metricType,
        value: String(qty),
        unit: unit ?? "",
        recordedAt,
        metadata: { rawMetricName: metricType },
      },
    ];
  }

  const subFields = [
    "asleep",
    "inBed",
    "core",
    "deep",
    "rem",
    "awake",
    "Avg",
    "Max",
    "Min",
    "value",
  ];
  const rows: HealthMetricRow[] = [];
  for (const key of subFields) {
    const n = toNumber(point[key]);
    if (n === null) continue;
    rows.push({
      source: "apple_health",
      metricType: `${metricType}_${key}`,
      value: String(n),
      unit: unit ?? "",
      recordedAt,
      metadata: { rawMetricName: metricType, subField: key },
    });
  }
  return rows;
}


appleHealthWebhook.post("/apple-health", async (req, res, next) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    if (secret !== config.webhookSecret) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return;
    }

    const metrics = req.body?.data?.metrics;
    console.log(
      "[webhook] Received apple-health payload, metrics:",
      Array.isArray(metrics) ? metrics.length : 0
    );
    if (!Array.isArray(metrics)) {
      res.status(400).json({ error: "Invalid payload: expected data.metrics array" });
      return;
    }

    const allRows: HealthMetricRow[] = [];
    let recordsSkipped = 0;

    for (const metric of metrics) {
      const metricType = metric.name as string;
      const unit = metric.units as string;
      const dataPoints = metric.data as Record<string, unknown>[];

      if (!Array.isArray(dataPoints)) continue;

      for (const point of dataPoints) {
        const rows = expandPoint(metricType, unit, point);
        if (rows.length === 0) {
          recordsSkipped++;
          continue;
        }
        allRows.push(...rows);
      }
    }

    let recordsSynced = 0;
    const CHUNK = 500;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const inserted = await db
        .insert(healthMetrics)
        .values(chunk)
        .onConflictDoNothing({
          target: [healthMetrics.source, healthMetrics.metricType, healthMetrics.recordedAt],
        })
        .returning({ id: healthMetrics.id });
      recordsSynced += inserted.length;
    }

    console.log(
      "[webhook] apple-health done, rows:",
      allRows.length,
      "synced:",
      recordsSynced,
      "skipped:",
      recordsSkipped
    );
    res.json({ recordsSynced, recordsSkipped });
  } catch (err) {
    next(err);
  }
});
