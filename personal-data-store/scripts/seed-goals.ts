import { db } from "../src/db/index.js";
import { goals } from "../src/domains/goals/goals.schema.js";
import { sql } from "drizzle-orm";

interface SeedGoal {
  slug: string;
  title: string;
  domain: string;
  metricSource: Record<string, unknown>;
  targetValue?: number;
  targetRangeLow?: number;
  targetRangeHigh?: number;
  targetDirection: "above" | "below" | "range";
  targetDate?: string;
  unit?: string;
  priority: number;
  canonicalTopics?: string[];
  notes?: string;
}

const SEEDS: SeedGoal[] = [
  {
    slug: "apob-below-90",
    title: "ApoB below 90 mg/dL",
    domain: "health",
    metricSource: { kind: "metric", metricType: "apob", source: "randox", agg: "latest" },
    targetValue: 90,
    targetDirection: "below",
    targetDate: "2026-12-31",
    unit: " mg/dL",
    priority: 5,
    canonicalTopics: ["goals.cardiovascular", "fitness.cardiovascular"],
    notes: "Berberine 500mg started April 2026. Re-test mid-May Randox panel.",
  },
  {
    slug: "hs-crp-below-1",
    title: "hsCRP below 1.0 mg/L",
    domain: "health",
    metricSource: { kind: "metric", metricType: "hs_crp", source: "randox", agg: "latest" },
    targetValue: 1.0,
    targetDirection: "below",
    targetDate: "2026-12-31",
    unit: " mg/L",
    priority: 4,
    canonicalTopics: ["goals.cardiovascular", "goals.inflammation"],
  },
  {
    slug: "vitamin-d-100-125",
    title: "Vitamin D 100–125 nmol/L",
    domain: "health",
    metricSource: { kind: "metric", metricType: "vitamin_d", source: "randox", agg: "latest" },
    targetRangeLow: 100,
    targetRangeHigh: 125,
    targetDirection: "range",
    targetDate: "2026-09-30",
    unit: " nmol/L",
    priority: 3,
    canonicalTopics: ["goals.vitamin_d", "genomics.vdr"],
    notes: "VDR double-red — needs higher serum to compensate.",
  },
  {
    slug: "waist-80-cm",
    title: "Waist 80 cm",
    domain: "health",
    metricSource: { kind: "metric", metricType: "waist_circumference", agg: "latest" },
    targetValue: 80,
    targetDirection: "below",
    targetDate: "2026-12-31",
    unit: " cm",
    priority: 4,
    canonicalTopics: ["goals.body_composition", "fitness.muscle_growth"],
    notes: "Body-comp protocol restart. Track weekly Mon/Thu.",
  },
  {
    slug: "weight-stability",
    title: "Weight trajectory",
    domain: "health",
    metricSource: { kind: "metric", metricType: "weight_body_mass", source: "apple_health", agg: "latest" },
    targetDirection: "below",
    targetValue: 80,
    unit: " kg",
    priority: 3,
    canonicalTopics: ["goals.body_composition"],
  },
  {
    slug: "strength-sessions-weekly",
    title: "Two strength sessions per week",
    domain: "fitness",
    metricSource: {
      kind: "sql",
      query: "select count(*) from workouts where started_at > now() - interval '7 days' and (name ilike '%strength%' or name ilike '%lift%' or name ilike '%resistance%' or name ilike '%traditional%')",
    },
    targetValue: 2,
    targetDirection: "above",
    unit: " /wk",
    priority: 4,
    canonicalTopics: ["fitness.strength"],
  },
  {
    slug: "yield-income-170k",
    title: "Yield income $170K/yr",
    domain: "finance",
    metricSource: {
      kind: "sql",
      query: "select coalesce(sum(amount::numeric), 0) * 12 from income_streams where stream_type = 'yield' and period_start > now() - interval '30 days'",
    },
    targetValue: 170000,
    targetDirection: "above",
    targetDate: "2026-12-31",
    unit: " USD/yr",
    priority: 5,
    canonicalTopics: ["finance.yield", "goals.yield"],
  },
  {
    slug: "monthly-spend-19k-gbp",
    title: "Monthly spend ≤ £19K",
    domain: "finance",
    metricSource: {
      kind: "sql",
      query: "select coalesce(abs(sum(amount::numeric)), 0) from transactions where date > now() - interval '30 days' and amount::numeric < 0 and currency = 'GBP'",
    },
    targetValue: 19000,
    targetDirection: "below",
    unit: " GBP/mo",
    priority: 4,
    canonicalTopics: ["finance.spend", "goals.spending"],
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const seed of SEEDS) {
    try {
      await db.insert(goals).values({
        slug: seed.slug,
        title: seed.title,
        domain: seed.domain,
        metricSource: seed.metricSource,
        targetValue: seed.targetValue !== undefined ? String(seed.targetValue) : null,
        targetRangeLow: seed.targetRangeLow !== undefined ? String(seed.targetRangeLow) : null,
        targetRangeHigh: seed.targetRangeHigh !== undefined ? String(seed.targetRangeHigh) : null,
        targetDirection: seed.targetDirection,
        targetDate: seed.targetDate ? new Date(seed.targetDate) : null,
        unit: seed.unit ?? null,
        priority: seed.priority,
        canonicalTopics: seed.canonicalTopics ?? null,
        notes: seed.notes ?? null,
      }).onConflictDoNothing();
      inserted++;
    } catch (err) {
      console.error(`[seed-goals] ${seed.slug} failed:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }
  const [{ count }] = await db.execute(sql`select count(*)::int as count from goals`) as unknown as Array<{ count: number }>;
  console.log(`[seed-goals] processed ${inserted} (${skipped} errors). Total goals in db: ${count}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
