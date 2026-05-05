import { db } from "../src/db/index.js";
import { interventions } from "../src/domains/interventions/interventions.schema.js";
import { sql } from "drizzle-orm";

interface SeedIntervention {
  slug: string;
  title: string;
  domain: string;
  type: "supplement" | "protocol" | "habit" | "financial" | "other";
  status?: "active" | "paused" | "completed" | "abandoned";
  startDate: string;
  endDate?: string;
  hypothesis: string;
  affectedMetrics: string[];
  affectedGoals?: string[];
  metricSource?: string;
  protocol?: string;
  windowDays?: number;
  canonicalTopics?: string[];
  notes?: string;
}

const SEEDS: SeedIntervention[] = [
  {
    slug: "berberine-500mg-2026-04",
    title: "Berberine 500mg/day (April 2026)",
    domain: "health",
    type: "supplement",
    status: "active",
    startDate: "2026-04-01",
    hypothesis:
      "500mg berberine daily reduces ApoB and total cholesterol by improving lipid clearance via AMPK activation. Expect 5–15% drop in ApoB by mid-May Randox panel.",
    affectedMetrics: ["apob", "total_cholesterol", "ldl_cholesterol", "hs_crp"],
    affectedGoals: ["apob-below-90", "hs-crp-below-1"],
    metricSource: "randox",
    protocol: "500mg with breakfast and dinner.",
    windowDays: 60,
    canonicalTopics: ["goals.cardiovascular"],
    notes: "Natural experiment boundary: Randox panel mid-May 2026.",
  },
  {
    slug: "vitamin-d-dose-audit-2026-04",
    title: "Vitamin D dose audit (5000 IU/day)",
    domain: "health",
    type: "supplement",
    status: "active",
    startDate: "2026-04-01",
    hypothesis:
      "VDR double-red genotype requires higher serum target. 5000 IU/day with K2 should push 25(OH)D into 100–125 nmol/L range.",
    affectedMetrics: ["vitamin_d"],
    affectedGoals: ["vitamin-d-100-125"],
    metricSource: "randox",
    protocol: "5000 IU D3 + 100mcg K2-MK7 daily with fat.",
    windowDays: 60,
    canonicalTopics: ["goals.vitamin_d", "genomics.vdr"],
    notes: "VDR double-red — needs higher serum to compensate for receptor inefficiency.",
  },
  {
    slug: "body-comp-protocol-restart-2026-04",
    title: "Body composition protocol restart",
    domain: "health",
    type: "protocol",
    status: "active",
    startDate: "2026-04-15",
    hypothesis:
      "Resistance training 2x/week + protein 1.6g/kg + sleep ≥7h reduces waist circumference and body fat. Target waist 80cm by year-end.",
    affectedMetrics: ["waist_circumference", "weight_body_mass", "body_fat_percentage"],
    affectedGoals: ["waist-80-cm", "weight-stability", "strength-sessions-weekly"],
    metricSource: null as unknown as string,
    protocol: "Strength 2x/week, protein target, sleep ≥7h, weekly Mon/Thu measurement.",
    windowDays: 28,
    canonicalTopics: ["goals.body_composition", "fitness.muscle_growth", "fitness.strength"],
    notes: "Tracks resumption after winter drift.",
  },
  {
    slug: "spend-cuts-post-2026-04",
    title: "Spend reduction toward £19K/mo target",
    domain: "finance",
    type: "financial",
    status: "active",
    startDate: "2026-04-01",
    hypothesis:
      "Trimmed subscriptions and discretionary categories should bring rolling 30-day GBP spend below £19K.",
    affectedMetrics: ["monthly_spend_gbp"],
    affectedGoals: ["monthly-spend-19k-gbp"],
    protocol: "Cancel/downgrade flagged subscriptions, cap dining/discretionary monthly.",
    windowDays: 30,
    canonicalTopics: ["finance.spend", "goals.spending"],
    notes: "First full post-cuts month is the canonical evaluation window.",
  },
  {
    slug: "mid-may-randox-panel-2026",
    title: "Mid-May Randox panel (post-berberine)",
    domain: "health",
    type: "protocol",
    status: "active",
    startDate: "2026-05-12",
    hypothesis:
      "Composite snapshot of ApoB, hsCRP, vitamin D, lipid panel after ~6 weeks on berberine and dose-audited D3.",
    affectedMetrics: ["apob", "hs_crp", "vitamin_d", "ldl_cholesterol", "total_cholesterol"],
    affectedGoals: ["apob-below-90", "hs-crp-below-1", "vitamin-d-100-125"],
    metricSource: "randox",
    windowDays: 90,
    canonicalTopics: ["goals.cardiovascular", "goals.vitamin_d"],
    notes: "Natural experiment endpoint — pre/post bracket for berberine + D dose audit.",
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const seed of SEEDS) {
    try {
      await db
        .insert(interventions)
        .values({
          slug: seed.slug,
          title: seed.title,
          domain: seed.domain,
          type: seed.type,
          status: seed.status ?? "active",
          startDate: new Date(seed.startDate),
          endDate: seed.endDate ? new Date(seed.endDate) : null,
          hypothesis: seed.hypothesis,
          affectedMetrics: seed.affectedMetrics,
          affectedGoals: seed.affectedGoals ?? null,
          metricSource: seed.metricSource ?? null,
          protocol: seed.protocol ?? null,
          windowDays: seed.windowDays ?? 28,
          canonicalTopics: seed.canonicalTopics ?? null,
          notes: seed.notes ?? null,
        })
        .onConflictDoNothing();
      inserted++;
    } catch (err) {
      console.error(`[seed-interventions] ${seed.slug} failed:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }
  const [{ count }] = (await db.execute(
    sql`select count(*)::int as count from interventions`,
  )) as unknown as Array<{ count: number }>;
  console.log(`[seed-interventions] processed ${inserted} (${skipped} errors). Total in db: ${count}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
