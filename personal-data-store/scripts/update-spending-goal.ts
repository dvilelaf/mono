import { db } from "../src/db/index.js";
import { goals } from "../src/domains/goals/goals.schema.js";
import { eq } from "drizzle-orm";

// Update the existing monthly-spend-19k-gbp goal so its metric source matches
// the burn endpoint: month-to-date GBP spending, excluding self_transfer,
// other, income, property, tax, investment, vehicle.
const SLUG = "monthly-spend-19k-gbp";

const QUERY = `
  select coalesce(round(sum(abs(amount::numeric))::numeric, 2), 0)
  from transactions
  where amount::numeric < 0
    and currency = 'GBP'
    and date >= date_trunc('month', current_date)::date
    and date <= current_date
    and (category is null or category not in (
      'self_transfer','other','income','property','tax','investment','vehicle'
    ))
`.trim().replace(/\s+/g, " ");

async function main() {
  const [existing] = await db.select().from(goals).where(eq(goals.slug, SLUG)).limit(1);
  if (!existing) {
    console.error(`Goal ${SLUG} not found — run seed-goals first.`);
    process.exit(1);
  }
  const [updated] = await db
    .update(goals)
    .set({
      metricSource: { kind: "sql", query: QUERY } as unknown as Record<string, unknown>,
      title: "Monthly spend ≤ £19K (MTD)",
      notes: "Month-to-date GBP discretionary spend, excluding transfers, income, property, tax, investment, vehicle. Burn page: /spending/burn.",
      updatedAt: new Date(),
    })
    .where(eq(goals.slug, SLUG))
    .returning();
  console.log("Updated goal:", updated?.slug, updated?.metricSource);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
