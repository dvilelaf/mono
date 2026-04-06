import { Router } from "express";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { healthMetrics } from "../domains/health/health.schema.js";

export const appleHealthWebhook = Router();

appleHealthWebhook.post("/apple-health", async (req, res, next) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    if (secret !== config.webhookSecret) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return;
    }

    const metrics = req.body?.data?.metrics;
    if (!Array.isArray(metrics)) {
      res.status(400).json({ error: "Invalid payload: expected data.metrics array" });
      return;
    }

    let recordsSynced = 0;

    for (const metric of metrics) {
      const metricType = metric.name as string;
      const unit = metric.units as string;
      const dataPoints = metric.data as { date: string; qty: number }[];

      if (!Array.isArray(dataPoints)) continue;

      for (const point of dataPoints) {
        await db.insert(healthMetrics).values({
          source: "apple_health",
          metricType,
          value: String(point.qty),
          unit,
          recordedAt: new Date(point.date),
          metadata: { rawMetricName: metric.name },
        });
        recordsSynced++;
      }
    }

    res.json({ recordsSynced });
  } catch (err) {
    next(err);
  }
});
