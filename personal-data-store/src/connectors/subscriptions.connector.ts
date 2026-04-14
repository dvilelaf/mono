import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { subscriptions } from "../domains/finance/subscriptions.schema.js";

interface TransactionCandidate extends Record<string, unknown> {
  description: string;
  currency: string;
  category: string | null;
  occurrences: number;
  avg_amount: string;
  stddev_amount: string | null;
  first_seen: string;
  last_seen: string;
  dates: string[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cleanName(description: string): string {
  let name = description;
  // Strip card transaction prefix
  name = name.replace(/^Card transaction of [\d.,]+ [A-Z]+ issued by /i, "");
  // Strip "To " prefix
  name = name.replace(/^To /, "");
  return name.trim();
}

function classifyFrequency(medianInterval: number): string | null {
  if (medianInterval >= 25 && medianInterval <= 35) return "monthly";
  if (medianInterval >= 80 && medianInterval <= 100) return "quarterly";
  if (medianInterval >= 350 && medianInterval <= 380) return "yearly";
  return null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const subscriptionsConnector: Connector = {
  name: "subscriptions",
  schedule: "0 3 * * *",

  async sync(): Promise<SyncResult> {
    let recordsSynced = 0;

    // Step 1: raw SQL query for recurring candidates
    const candidates = await db.execute<TransactionCandidate>(sql`
      SELECT description, currency, category,
        count(*)::int AS occurrences,
        round(avg(abs(amount::numeric))::numeric, 2) AS avg_amount,
        round(stddev(abs(amount::numeric))::numeric, 2) AS stddev_amount,
        min(date) AS first_seen, max(date) AS last_seen,
        array_agg(date ORDER BY date) AS dates
      FROM transactions
      WHERE amount::numeric < 0
      GROUP BY description, currency, category
      HAVING count(*) >= 3
    `);

    console.log(`[subscriptions] ${candidates.length} candidates to evaluate`);

    const now = new Date();

    for (const row of candidates) {
      // Step 2: compute intervals between consecutive dates
      const dates = (row.dates as unknown as string[]).map((d) => new Date(d).getTime());
      if (dates.length < 2) continue;

      const intervals: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push(Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)));
      }

      const medianInterval = median(intervals);

      // Step 3: classify frequency
      const frequency = classifyFrequency(medianInterval);
      if (!frequency) continue;

      // Step 4: amount variance check
      const avg = parseFloat(row.avg_amount);
      const stddev = row.stddev_amount ? parseFloat(row.stddev_amount) : 0;
      const varianceOk = stddev < 5 || (avg > 0 && stddev / avg < 0.15);
      if (!varianceOk) continue;

      // Step 5: determine status
      const lastSeenDate = new Date(row.last_seen);
      const daysSinceLastSeen = Math.round((now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24));
      let status: string;
      if (daysSinceLastSeen <= 60) {
        status = "active";
      } else if (daysSinceLastSeen <= 120) {
        status = "paused";
      } else {
        status = "cancelled";
      }

      // Step 6: confidence
      const ratio = avg > 0 ? stddev / avg : 0;
      let confidence: string;
      if (row.occurrences >= 6 && (stddev === 0 || ratio < 0.05)) {
        confidence = "high";
      } else if (row.occurrences >= 4 && ratio < 0.10) {
        confidence = "medium";
      } else {
        confidence = "low";
      }

      // Step 7: next expected (only if active)
      const nextExpected = status === "active" ? addDays(row.last_seen, medianInterval) : null;

      // Step 8: clean name
      const name = cleanName(row.description);

      // Upsert into subscriptions table
      try {
        await db.insert(subscriptions).values({
          name,
          description: row.description,
          amount: avg.toFixed(2),
          currency: row.currency,
          frequency,
          status,
          confidence,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          nextExpected: nextExpected ?? undefined,
          category: row.category ?? undefined,
          metadata: {
            occurrences: row.occurrences,
            stddev,
            medianIntervalDays: medianInterval,
          },
          detectedAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [subscriptions.description, subscriptions.currency],
          set: {
            amount: avg.toFixed(2),
            status,
            confidence,
            lastSeen: row.last_seen,
            nextExpected: nextExpected ?? undefined,
            metadata: {
              occurrences: row.occurrences,
              stddev,
              medianIntervalDays: medianInterval,
            },
            updatedAt: now,
          },
        });
        recordsSynced++;
      } catch (err) {
        console.error(`[subscriptions] Failed to upsert "${row.description}":`, (err as Error).message);
      }
    }

    console.log(`[subscriptions] Upserted ${recordsSynced} subscriptions`);
    return { recordsSynced };
  },
};
