import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { subscriptions } from "../domains/finance/subscriptions.schema.js";

interface RawCandidate {
  description: string;
  currency: string;
  category: string | null;
  occurrences: number;
  avg_amount: string;
  stddev_amount: string | null;
  latest_amount: string;
  first_seen: string;
  last_seen: string;
  dates: string | string[];
}

interface MergedCandidate {
  merchant: string;
  currency: string;
  category: string | null;
  occurrences: number;
  latestAmount: number;
  firstSeen: string;
  lastSeen: string;
  dates: string[];
}

const CARD_PREFIX_RE = /^Card transaction of [\d.,]+ [A-Z]+ issued by /i;

// Categories that are never recurring payments — one-off purchases and ad-hoc spend
const EXCLUDED_CATEGORIES = new Set([
  "dining", "food", "groceries",
  "shopping", "travel", "transport", "self_transfer", "income",
  "property", "tax", "investment", "vehicle",
]);

function parseDates(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return raw.replace(/[{}]/g, "").split(",").filter(Boolean);
  return [];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cleanName(merchant: string): string {
  return merchant
    .replace(/^To /, "")
    .replace(/^Paid to /, "")
    .replace(/^Sent money to /, "")
    .trim();
}

function classifyFrequency(medianInterval: number): string | null {
  // Monthly: 20-45 days — wide range because utility bills, catch-up payments,
  // and weekend-shifted billing create irregular intervals
  if (medianInterval >= 20 && medianInterval <= 45) return "monthly";
  if (medianInterval >= 80 && medianInterval <= 110) return "quarterly";
  if (medianInterval >= 340 && medianInterval <= 400) return "yearly";
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

    // Step 1: fetch all recurring debit groups (lowered to 2+ for merging)
    const rawRows = await db.execute(sql`
      SELECT description, currency, category,
        count(*)::int AS occurrences,
        round(avg(abs(amount::numeric))::numeric, 2) AS avg_amount,
        round(stddev(abs(amount::numeric))::numeric, 2) AS stddev_amount,
        round(abs((array_agg(amount ORDER BY date DESC))[1]::numeric)::numeric, 2) AS latest_amount,
        min(date) AS first_seen, max(date) AS last_seen,
        array_agg(date ORDER BY date) AS dates
      FROM transactions
      WHERE amount::numeric < 0
      GROUP BY description, currency, category
      HAVING count(*) >= 2
    `) as unknown as RawCandidate[];

    // Step 2: Merge groups where description differs only by amount prefix
    // "Card transaction of 18.00 GBP issued by X" and "Card transaction of 90.00 GBP issued by X"
    // become one group for merchant "X"
    const mergedMap = new Map<string, MergedCandidate>();

    for (const row of rawRows) {
      const merchant = row.description.replace(CARD_PREFIX_RE, "");
      const key = `${merchant}||${row.currency}`;
      const dates = parseDates(row.dates);
      const latestAmount = parseFloat(row.latest_amount) || parseFloat(row.avg_amount);

      if (!mergedMap.has(key)) {
        mergedMap.set(key, {
          merchant,
          currency: row.currency,
          category: row.category,
          occurrences: row.occurrences,
          latestAmount,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          dates,
        });
      } else {
        const existing = mergedMap.get(key)!;
        existing.dates = [...existing.dates, ...dates].sort();
        existing.occurrences += row.occurrences;
        if (row.first_seen < existing.firstSeen) existing.firstSeen = row.first_seen;
        if (row.last_seen > existing.lastSeen) {
          existing.lastSeen = row.last_seen;
          existing.latestAmount = latestAmount;
        }
        if (!existing.category && row.category) existing.category = row.category;
      }
    }

    // Minimum 3 occurrences normally; 2 allowed only for utility-like categories
    // where we know the merchant is a recurring bill
    const UTILITY_CATEGORIES = new Set(["utilities", "transfer_out", "business", "insurance"]);
    const candidates = [...mergedMap.values()].filter(r => {
      if (r.occurrences >= 3) return true;
      // Allow 2 occurrences only for known bill categories
      return r.occurrences >= 2 && r.category && UTILITY_CATEGORIES.has(r.category);
    });
    console.log(`[subscriptions] ${candidates.length} candidates to evaluate`);

    const now = new Date();

    for (const row of candidates) {
      // --- Pre-filters: skip things that are clearly not subscriptions ---

      // Skip excluded categories (groceries, dining, family transfers, etc.)
      if (row.category && EXCLUDED_CATEGORIES.has(row.category)) continue;

      // Skip very small amounts (< £2) — incidental, not recurring payments
      if (row.latestAmount < 2) continue;

      // --- Interval analysis ---

      const timestamps = row.dates.map(d => new Date(d).getTime());
      if (timestamps.length < 2) continue;

      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(Math.round((timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24)));
      }

      const medianInterval = median(intervals);
      const frequency = classifyFrequency(medianInterval);
      if (!frequency) continue;

      // --- Timing consistency (primary signal) ---

      const intervalStddev = intervals.length > 1
        ? Math.sqrt(intervals.reduce((s, v) => s + (v - medianInterval) ** 2, 0) / intervals.length)
        : 0;
      // Lenient threshold: billing dates drift, weekends shift payments
      const timingConsistent = intervalStddev < 12;

      // Timing consistency requirement.
      // Utility bills and business payments have messy timing (catch-up payments,
      // variable billing cycles) but are clearly recurring. Accept them with
      // looser thresholds based on category.
      const isUtilityLike = row.category && UTILITY_CATEGORIES.has(row.category);
      const looselyRecurring = intervalStddev < 20;

      if (isUtilityLike) {
        // Utilities: accept any frequency classification — timing can be messy
        // but the merchant clearly recurs
      } else if (!timingConsistent && !looselyRecurring) {
        continue;
      } else if (row.occurrences <= 3 && !timingConsistent) {
        continue;
      }

      // --- Status ---

      const lastSeenDate = new Date(row.lastSeen);
      const daysSinceLastSeen = Math.round((now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24));
      let status: string;
      if (daysSinceLastSeen <= 60) {
        status = "active";
      } else if (daysSinceLastSeen <= 120) {
        status = "paused";
      } else {
        status = "cancelled";
      }

      // --- Confidence ---

      let confidence: string;
      if (row.occurrences >= 6 && intervalStddev < 5) {
        confidence = "high";
      } else if (row.occurrences >= 4 && intervalStddev < 10) {
        confidence = "medium";
      } else {
        confidence = "low";
      }

      // --- Next expected ---

      const nextExpected = status === "active" ? addDays(row.lastSeen, medianInterval) : null;
      const name = cleanName(row.merchant);

      // --- Upsert ---

      try {
        await db.insert(subscriptions).values({
          name,
          description: row.merchant,
          amount: row.latestAmount.toFixed(2),
          currency: row.currency,
          frequency,
          status,
          confidence,
          firstSeen: row.firstSeen,
          lastSeen: row.lastSeen,
          nextExpected: nextExpected ?? undefined,
          category: row.category ?? undefined,
          metadata: {
            occurrences: row.occurrences,
            medianIntervalDays: medianInterval,
            intervalStddev: Math.round(intervalStddev * 10) / 10,
          },
          detectedAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [subscriptions.description, subscriptions.currency],
          set: {
            name,
            amount: row.latestAmount.toFixed(2),
            status,
            confidence,
            lastSeen: row.lastSeen,
            nextExpected: nextExpected ?? undefined,
            metadata: {
              occurrences: row.occurrences,
              medianIntervalDays: medianInterval,
              intervalStddev: Math.round(intervalStddev * 10) / 10,
            },
            updatedAt: now,
          },
        });
        recordsSynced++;
      } catch (err) {
        console.error(`[subscriptions] Failed to upsert "${row.merchant}":`, (err as Error).message);
      }
    }

    console.log(`[subscriptions] Upserted ${recordsSynced} subscriptions`);
    return { recordsSynced };
  },
};
