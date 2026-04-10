import "dotenv/config";
import { db } from "../src/db/index.js";
import { incomeStreams } from "../src/domains/finance/income.schema.js";
import { transactions } from "../src/domains/finance/finance.schema.js";
import { portfolioSnapshots, wallets } from "../src/domains/finance/finance.schema.js";
import { sql, eq, and, gte, desc } from "drizzle-orm";

async function extractSavingsInterest() {
  console.log("Extracting savings interest...");

  // Allica + Paragon daily interest from Revolut savings
  const rows = await db.execute(sql`
    SELECT
      date_trunc('month', date::date)::date AS month,
      description,
      currency,
      sum(amount::numeric) AS total
    FROM transactions
    WHERE amount::numeric > 0
      AND (description LIKE '%Allica%' OR description LIKE '%Paragon%' OR description = 'Gross Interest')
    GROUP BY month, description, currency
    ORDER BY month
  `);

  let count = 0;
  for (const row of rows as any[]) {
    const monthStart = new Date(row.month);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const source = row.description.includes("Allica") ? "allica_bank"
      : row.description.includes("Paragon") ? "paragon_bank"
      : "revolut_savings";

    try {
      const inserted = await db.insert(incomeStreams).values({
        source,
        streamType: "interest",
        asset: row.currency,
        amount: String(row.total),
        currency: row.currency,
        periodStart: monthStart,
        periodEnd: monthEnd,
        metadata: { description: row.description },
      }).onConflictDoNothing().returning({ id: incomeStreams.id });
      if (inserted.length) count++;
    } catch {}
  }
  console.log(`  ${count} savings interest records`);
}

async function extractValoryIncome() {
  console.log("Extracting Valory/OLAS income...");

  const rows = await db.execute(sql`
    SELECT date, description, amount, currency
    FROM transactions
    WHERE amount::numeric > 0
      AND (lower(description) LIKE '%valory%')
    ORDER BY date
  `);

  let count = 0;
  for (const row of rows as any[]) {
    const date = new Date(row.date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    try {
      const inserted = await db.insert(incomeStreams).values({
        source: "valory_olas",
        streamType: "protocol_income",
        asset: row.currency,
        amount: String(row.amount),
        currency: row.currency,
        periodStart: date,
        periodEnd: endDate,
        metadata: { description: row.description },
      }).onConflictDoNothing().returning({ id: incomeStreams.id });
      if (inserted.length) count++;
    } catch {}
  }
  console.log(`  ${count} Valory income records`);
}

async function derivePortfolioYield() {
  console.log("Deriving yield from portfolio snapshots...");

  // Get all wallets with snapshots
  const allWallets = await db.select().from(wallets);

  let count = 0;
  for (const wallet of allWallets) {
    const snapshots = await db.select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.walletId, wallet.id))
      .orderBy(desc(portfolioSnapshots.snapshotAt));

    if (snapshots.length < 2) continue;

    // Group snapshots by day, take earliest and latest per day
    const byDay = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const day = new Date(s.snapshotAt).toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(s);
    }

    const days = Array.from(byDay.keys()).sort();
    if (days.length < 2) continue;

    // Compare first day to last day for overall yield estimate
    const firstDay = byDay.get(days[0])![0];
    const lastDay = byDay.get(days[days.length - 1])![0];

    const firstVal = Number(firstDay.totalValueUsd);
    const lastVal = Number(lastDay.totalValueUsd);
    const diff = lastVal - firstVal;

    if (Math.abs(diff) < 1) continue;

    // This is crude — includes price appreciation, not just yield
    // Store as "portfolio_change" not "yield"
    try {
      const inserted = await db.insert(incomeStreams).values({
        source: "zerion",
        streamType: "portfolio_change",
        asset: "USD",
        amount: String(diff.toFixed(2)),
        currency: "USD",
        periodStart: new Date(firstDay.snapshotAt),
        periodEnd: new Date(lastDay.snapshotAt),
        metadata: {
          walletAddress: wallet.address.slice(0, 10) + "...",
          chain: wallet.chain,
          startValue: firstVal,
          endValue: lastVal,
          percentChange: firstVal > 0 ? ((diff / firstVal) * 100).toFixed(2) + "%" : "n/a",
        },
      }).onConflictDoNothing().returning({ id: incomeStreams.id });
      if (inserted.length) count++;
    } catch {}
  }
  console.log(`  ${count} portfolio change records`);
}

async function main() {
  await extractSavingsInterest();
  await extractValoryIncome();
  await derivePortfolioYield();

  const total = await db.execute(sql`SELECT count(*) FROM income_streams`);
  console.log(`\nDone. Total income_streams records: ${(total as any[])[0].count}`);
  process.exit(0);
}

main();
