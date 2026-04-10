import type { Connector, SyncResult, SyncOptions } from "./connector.interface.js";
import { db } from "../db/index.js";
import { healthMetrics } from "../domains/health/health.schema.js";

const OURA_BASE_URL = "https://api.ouraring.com/v2/usercollection";

async function ouraFetch(endpoint: string, startDate: string, endDate: string): Promise<unknown> {
  const token = process.env.OURA_ACCESS_TOKEN;
  if (!token) throw new Error("OURA_ACCESS_TOKEN not configured");

  const res = await fetch(`${OURA_BASE_URL}/${endpoint}?start_date=${startDate}&end_date=${endDate}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Oura API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export const auraConnector: Connector = {
  name: "aura",
  schedule: "0 */6 * * *",

  async sync(options?: SyncOptions): Promise<SyncResult> {
    const endDate = options?.endDate ?? new Date().toISOString().slice(0, 10);
    const startDate = options?.startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let recordsSynced = 0;

    // Fetch sleep scores
    const sleepData = (await ouraFetch("daily_sleep", startDate, endDate)) as {
      data: { day: string; score: number; contributors: Record<string, number> }[];
    };
    for (const entry of sleepData.data) {
      if (entry.score == null) continue;
      const inserted = await db.insert(healthMetrics).values({
        source: "aura", metricType: "sleep_score",
        value: String(entry.score), unit: "score",
        recordedAt: new Date(entry.day),
        metadata: { contributors: entry.contributors },
      }).onConflictDoNothing().returning({ id: healthMetrics.id });
      if (inserted.length) recordsSynced++;
    }

    // Fetch daily activity
    const activityData = (await ouraFetch("daily_activity", startDate, endDate)) as {
      data: { day: string; score: number; steps: number; active_calories: number }[];
    };
    for (const entry of activityData.data) {
      if (entry.score == null) continue;
      const inserted = await db.insert(healthMetrics).values({
        source: "aura", metricType: "activity_score",
        value: String(entry.score), unit: "score",
        recordedAt: new Date(entry.day),
        metadata: { steps: entry.steps, activeCalories: entry.active_calories },
      }).onConflictDoNothing().returning({ id: healthMetrics.id });
      if (inserted.length) recordsSynced++;
    }

    return { recordsSynced };
  },
};
