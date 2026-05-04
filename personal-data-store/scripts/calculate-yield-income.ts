import "dotenv/config";
import { db } from "../src/db/index.js";
import { incomeStreams } from "../src/domains/finance/income.schema.js";
import { yieldPositions } from "../src/domains/finance/yield-positions.schema.js";
import { sql } from "drizzle-orm";

// DeFiLlama pool IDs for APY lookup
const DEFILLAMA_POOLS: Record<string, string> = {
  "Steakhouse Prime Instant": "b55f43a8-f444-4cd8-a3a4-0a4e786ba566", // morpho-v1 STEAKUSDC
  "Staked Ethena USDe": "66985a81-9c51-46ca-9977-42b4fe7bc6df",       // ethena-usde SUSDE
  "Savings USDS": "d8c4eff5-c8a9-46fc-a888-057c4c668e72",             // sky-lending SUSDS
  "Syrup USDT": "8edfdf02-cdbb-43f7-bca6-954e5fe56813",               // maple USDT
  "Jupiter Lend USDT": "a2fbc7ec-22c2-43fe-aa42-49f854aa940d",        // jupiter-lend USDT
  "Lido Staked ETH": "747c1d2a-c668-4682-b9f9-296708a3dd90",          // lido STETH
  "Jupiter Lend WSOL": "86d5dc3c-682f-4227-b1c9-7e51c6e60cda",        // jupiter-lend WSOL
  "Coinbase Earn (Stablecoins)": "",                                    // manual APY, no DeFiLlama pool
};

const COINBASE_APY = 0.035; // manual

async function fetchApy(poolId: string): Promise<number | null> {
  if (!poolId) return null;
  try {
    const res = await fetch(`https://yields.llama.fi/chart/${poolId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const points = data.data || [];
    if (points.length === 0) return null;
    // Return latest APY
    return points[points.length - 1].apy / 100;
  } catch {
    return null;
  }
}

async function calculateForMonth(year: number, month: number) {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0)); // last day of month
  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;

  console.log(`\nCalculating yield income for ${monthLabel}...`);

  // Get all unique position names
  const positions = await db.execute(sql`
    SELECT DISTINCT name FROM yield_positions ORDER BY name
  `);

  let totalYield = 0;
  let inserted = 0;

  for (const pos of positions as any[]) {
    const name = pos.name;

    // Try snapshot-based calculation: compare token balances at start vs end of month
    const startSnapshot = await db.execute(sql`
      SELECT token_balance, token_price, value_usd, apy, snapshot_at
      FROM yield_positions
      WHERE name = ${name} AND snapshot_at >= ${monthStart.toISOString()} AND snapshot_at < ${new Date(Date.UTC(year, month - 1, 2)).toISOString()}
      ORDER BY snapshot_at ASC LIMIT 1
    `);

    const endSnapshot = await db.execute(sql`
      SELECT token_balance, token_price, value_usd, apy, snapshot_at
      FROM yield_positions
      WHERE name = ${name} AND snapshot_at >= ${new Date(Date.UTC(year, month - 1, 25)).toISOString()} AND snapshot_at < ${new Date(Date.UTC(year, month, 1)).toISOString()}
      ORDER BY snapshot_at DESC LIMIT 1
    `);

    let yieldUsd: number;
    let method: string;
    let apy: number | null = null;
    let positionValue: number;

    if ((startSnapshot as any[]).length > 0 && (endSnapshot as any[]).length > 0) {
      // We have snapshots spanning the month — calculate from token balance growth
      const start = (startSnapshot as any[])[0];
      const end = (endSnapshot as any[])[0];
      const balanceGrowth = Number(end.token_balance) - Number(start.token_balance);
      const endPrice = Number(end.token_price);
      positionValue = Number(end.value_usd);

      // For yield-bearing tokens, the balance stays the same but price increases
      // For rebasing tokens (stETH), the balance increases
      // Use value_usd difference as a proxy, but this includes price changes
      // Better: use token balance growth * end price for rebasing tokens
      if (balanceGrowth > 0) {
        yieldUsd = balanceGrowth * endPrice;
        method = "snapshot_balance_delta";
      } else {
        // Exchange-rate token (sUSDe, steakUSDC, etc.) — balance same, price grew
        // Price growth on same balance = yield
        const priceGrowth = endPrice - Number(start.token_price);
        yieldUsd = Number(start.token_balance) * priceGrowth;
        method = "snapshot_price_delta";
      }
      const endApyPct = Number(end.apy);
      apy = endApyPct ? endApyPct / 100 : null;
    } else {
      // No spanning snapshots — estimate from latest snapshot + APY
      const latest = await db.execute(sql`
        SELECT token_balance, token_price, value_usd, apy
        FROM yield_positions
        WHERE name = ${name}
        ORDER BY snapshot_at DESC LIMIT 1
      `);

      if ((latest as any[]).length === 0) continue;
      const snap = (latest as any[])[0];
      positionValue = Number(snap.value_usd);

      // Get APY: from snapshot (stored as percent, e.g. 4.1), then DeFiLlama, then skip
      const snapApyPct = Number(snap.apy);
      apy = snapApyPct ? snapApyPct / 100 : null;
      if (!apy) {
        const poolId = DEFILLAMA_POOLS[name];
        if (poolId) {
          apy = await fetchApy(poolId);
          if (apy) console.log(`  ${name}: fetched APY ${(apy * 100).toFixed(2)}% from DeFiLlama`);
        } else if (name === "Coinbase Earn (Stablecoins)") {
          apy = COINBASE_APY;
        }
      }

      if (!apy) {
        console.log(`  ${name}: no APY available, skipping`);
        continue;
      }

      yieldUsd = positionValue * apy / 12;
      method = "estimated_from_apy";
    }

    if (yieldUsd <= 0) {
      console.log(`  ${name}: yield <= 0, skipping`);
      continue;
    }

    yieldUsd = Math.round(yieldUsd * 100) / 100;

    // Determine source and asset from position name
    const sourceMap: Record<string, { source: string; asset: string }> = {
      "Steakhouse Prime Instant": { source: "morpho", asset: "USDC" },
      "Staked Ethena USDe": { source: "ethena", asset: "USDe" },
      "Savings USDS": { source: "sky", asset: "USDS" },
      "Syrup USDT": { source: "maple", asset: "USDT" },
      "Jupiter Lend USDT": { source: "jupiter", asset: "USDT" },
      "Lido Staked ETH": { source: "lido", asset: "ETH" },
      "Jupiter Lend WSOL": { source: "jupiter", asset: "SOL" },
      "Coinbase Earn (Stablecoins)": { source: "coinbase_earn", asset: "USDC" },
    };

    const mapping = sourceMap[name];
    if (!mapping) {
      console.log(`  ${name}: no source mapping, skipping`);
      continue;
    }

    // Skip Coinbase if already tracked by connector
    if (name === "Coinbase Earn (Stablecoins)") {
      const existing = await db.execute(sql`
        SELECT count(*) as cnt FROM income_streams
        WHERE source = 'coinbase' AND period_start >= ${monthStart.toISOString()} AND period_start < ${new Date(Date.UTC(year, month, 1)).toISOString()}
      `);
      if (Number((existing as any[])[0].cnt) > 0) {
        console.log(`  ${name}: already tracked by Coinbase connector, skipping`);
        continue;
      }
    }

    try {
      const result = await db.insert(incomeStreams).values({
        source: mapping.source,
        streamType: "yield",
        asset: mapping.asset,
        amount: String(yieldUsd),
        currency: "USD",
        periodStart: monthStart,
        periodEnd: monthEnd,
        metadata: {
          method,
          apy: apy,
          position_value: positionValue,
          position_name: name,
        },
      }).onConflictDoNothing().returning({ id: incomeStreams.id });

      if (result.length > 0) {
        inserted++;
        totalYield += yieldUsd;
        console.log(`  ${name}: $${yieldUsd.toFixed(2)}/mo (${apy ? (apy * 100).toFixed(2) + "% APY" : method})`);
      } else {
        console.log(`  ${name}: already exists for ${monthLabel}`);
      }
    } catch (err) {
      console.error(`  ${name}: insert failed — ${(err as Error).message}`);
    }
  }

  console.log(`\n${monthLabel}: $${totalYield.toFixed(2)} yield from ${inserted} new positions`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Default: calculate for previous month
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    await calculateForMonth(prevYear, prevMonth);
  } else if (args[0] === "--month" && args[1]) {
    // --month 2026-03
    const [y, m] = args[1].split("-").map(Number);
    await calculateForMonth(y, m);
  } else if (args[0] === "--range" && args[1] && args[2]) {
    // --range 2025-10 2026-03
    const [sy, sm] = args[1].split("-").map(Number);
    const [ey, em] = args[2].split("-").map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      await calculateForMonth(y, m);
      m++;
      if (m > 12) { m = 1; y++; }
    }
  } else {
    console.log("Usage:");
    console.log("  npx tsx scripts/calculate-yield-income.ts              # previous month");
    console.log("  npx tsx scripts/calculate-yield-income.ts --month 2026-03");
    console.log("  npx tsx scripts/calculate-yield-income.ts --range 2025-10 2026-03");
  }

  process.exit(0);
}

main();
