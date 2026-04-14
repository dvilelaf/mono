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

// Categories that are never subscriptions — regular purchases or transfers
const EXCLUDED_CATEGORIES = new Set([
  "family", "childcare", "dining", "food", "groceries",
  "shopping", "travel", "transport", "self_transfer", "income",
  "property", "tax", "investment", "vehicle", "transfer_out",
]);

// "To [Name]" patterns are person-to-person transfers, not subscriptions.
// Allow "To [Business]" by checking against known utility/service prefixes.
const TRANSFER_TO_PERSON_RE = /^To [A-Z][a-z]+ [A-Z]/;
const KNOWN_SERVICE_PREFIXES = [
  "To British Gas", "To OVO Energy", "To H3g", "To Virgin Media",
  "To Southern Water", "To BT ", "To L B Camden",
  "To GBP Savings", "To American Express",
];

function isTransferToPerson(merchant: string): boolean {
  if (!TRANSFER_TO_PERSON_RE.test(merchant)) return false;
  return !KNOWN_SERVICE_PREFIXES.some(p => merchant.startsWith(p));
}

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
  // Monthly: 25-38 days (months vary 28-31, billing dates drift)
  if (medianInterval >= 25 && medianInterval <= 38) return "monthly";
  if (medianInterval >= 80 && medianInterval <= 100) return "quarterly";
  if (medianInterval >= 350 && medianInterval <= 395) return "yearly";
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

    const candidates = [...mergedMap.values()].filter(r => r.occurrences >= 3);
    console.log(`[subscriptions] ${candidates.length} candidates to evaluate`);

    const now = new Date();

    for (const row of candidates) {
      // --- Pre-filters: skip things that are clearly not subscriptions ---

      // Skip excluded categories (groceries, dining, family transfers, etc.)
      if (row.category && EXCLUDED_CATEGORIES.has(row.category)) continue;

      // Skip person-to-person transfers ("To Dagmar Carnevale Lavezzoli")
      if (isTransferToPerson(row.merchant)) continue;

      // Skip very small amounts (< £2) — incidental, not subscriptions
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

      // Require timing consistency for all detections.
      // High occurrence can compensate for slightly noisier timing.
      if (!timingConsistent && !(row.occurrences >= 10 && intervalStddev < 18)) continue;

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
