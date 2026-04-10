# Monthly Income Statement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure accurate monthly income statements by fixing data collection gaps and building a frontend income statement page showing spending vs earnings per month.

**Architecture:** Four independent workstreams: (1) fix pm2 crons so yield snapshots accumulate, (2) add Solana position fetching to the snapshot script, (3) add a backend API endpoint for monthly income statements, (4) build a frontend page with month picker showing income vs spending.

**Tech Stack:** TypeScript, Express, Next.js 16, PostgreSQL, DeFiLlama API, Jupiter Lending API, pm2

---

### Task 1: Fix pm2 crons for yield snapshots and income calculation

**Files:**
- None (pm2 commands only)

The yield-snapshot and yield-income pm2 processes are stopped. They need to be restarted and verified.

- [ ] **Step 1: Restart yield-snapshot cron**

```bash
pm2 restart yield-snapshot
pm2 save
```

Expected: yield-snapshot shows "online" status with cron `0 8 */3 * *`

- [ ] **Step 2: Verify yield-snapshot runs**

```bash
npx tsx scripts/snapshot-yield-positions.ts
```

Expected: Output showing positions fetched from Zerion + manual fallbacks. Check `/tmp/yield-snapshot.log` for output.

- [ ] **Step 3: Verify yield-income cron is registered**

```bash
pm2 show yield-income
```

Expected: Shows cron `0 9 2 * *` (2nd of each month at 9am), status online.

- [ ] **Step 4: Commit**

No code changes — pm2 state only.

---

### Task 2: Add Solana position fetching to snapshot script

**Files:**
- Modify: `scripts/snapshot-yield-positions.ts`

Jupiter Lend positions (USDT, WSOL) on Solana are currently hardcoded manual entries. Add fetching via Jupiter's public API.

- [ ] **Step 1: Research Jupiter lending token prices**

Jupiter lending tokens (jlUSDT, jlWSOL) are standard SPL tokens. Their value can be fetched via Jupiter's price API or by querying the token account balance and exchange rate.

The simplest approach: use the Jupiter Price API v2 to get the USD value of the wallet's jlUSDT and jlWSOL holdings, combined with Solana RPC to get token balances.

Alternative: use the Helius DAS API (if available) or Birdeye API.

Simplest of all: use the Zerion-style approach but with Solana FM or similar portfolio API.

- [ ] **Step 2: Add Solana fetching function**

Add a `fetchSolanaPositions` function to `scripts/snapshot-yield-positions.ts` that queries the Jupiter lending token balances for the Solana wallet.

```typescript
// Token mint addresses for Jupiter lending tokens
const JUPITER_LENDING_MINTS: Record<string, string> = {
  jlUSDT: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // verify actual mint
  jlWSOL: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // verify actual mint
};

async function fetchSolanaPositions(walletAddress: string): Promise<{ token: string; balance: number; price: number; value: number }[]> {
  // Use Jupiter Price API + Solana RPC getTokenAccountsByOwner
  // Fallback: use the existing Zerion approach since Zerion now supports Solana
  const results: { token: string; balance: number; price: number; value: number }[] = [];

  // Try Zerion first — it may support Solana wallets
  if (ZERION_KEY) {
    try {
      const positions = await fetchZerionPositions(walletAddress);
      for (const pos of positions) {
        const symbol = pos.attributes?.fungible_info?.symbol?.toLowerCase();
        if (symbol === "jlusdt" || symbol === "jlwsol") {
          results.push({
            token: symbol,
            balance: pos.attributes?.quantity?.float || 0,
            price: pos.attributes?.price || 0,
            value: pos.attributes?.value || 0,
          });
        }
      }
      if (results.length > 0) return results;
    } catch {}
  }

  // Fallback: use Jupiter price API for the underlying tokens
  // and Solana RPC for balances
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    // ... Solana RPC implementation
  } catch {}

  return results;
}
```

NOTE: The exact implementation depends on whether Zerion supports the Solana wallet. Test Zerion first — if it works, no additional dependency needed. If not, use `@solana/web3.js` and the Jupiter price API.

- [ ] **Step 3: Replace manual Solana entries with fetched data**

In the `main()` function, replace the hardcoded `manualPositions` for Jupiter entries with calls to `fetchSolanaPositions`:

```typescript
// After Zerion EVM fetching, handle Solana positions
const solanaWallet = POSITIONS.find(p => p.chain === "solana")?.wallet;
if (solanaWallet) {
  const solPositions = await fetchSolanaPositions(solanaWallet);
  for (const sp of solPositions) {
    const config = POSITIONS.find(p => p.token.toLowerCase() === sp.token);
    if (!config) continue;

    await db.insert(yieldPositions).values({
      name: config.name,
      protocol: config.protocol,
      chain: config.chain,
      token: config.token,
      tokenBalance: String(sp.balance),
      tokenPrice: String(sp.price),
      valueUsd: String(sp.value),
      snapshotAt: now,
      metadata: { wallet: config.wallet, source: "solana_api" },
    });
    console.log(`  ${config.name}: ${sp.balance.toFixed(2)} ${config.token} = $${sp.value.toFixed(2)}`);
    count++;
  }
}
```

- [ ] **Step 4: Remove hardcoded manual positions for Solana**

Remove the Jupiter entries from the `manualPositions` array (keep only EVM manual fallbacks that Zerion might miss).

- [ ] **Step 5: Test the script**

```bash
npx tsx scripts/snapshot-yield-positions.ts
```

Expected: Jupiter positions fetched via API instead of hardcoded.

- [ ] **Step 6: Commit**

```bash
git add scripts/snapshot-yield-positions.ts
git commit -m "feat: add automated Solana position fetching for Jupiter Lend"
```

---

### Task 3: Add backend API endpoint for monthly income statement

**Files:**
- Modify: `src/domains/finance/finance.routes.ts`

Add a `/api/finance/income-statement` endpoint that returns monthly income (from income_streams + OLAS transactions) and spending (from transactions) for a given month or range.

- [ ] **Step 1: Add the income-statement endpoint**

Add to `finance.routes.ts`:

```typescript
financeRouter.get("/income-statement", async (req, res, next) => {
  try {
    const from = req.query.from as string || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const to = req.query.to as string || new Date().toISOString().slice(0, 10);

    // Income from income_streams (yield, interest)
    const yieldIncome = await db.execute(sql`
      SELECT
        date_trunc('month', period_start)::date AS month,
        source, stream_type, asset, currency,
        SUM(amount::numeric)::numeric(12,2) AS total
      FROM income_streams
      WHERE period_start >= ${from} AND period_start < ${to}
        AND amount::numeric > 0.01
      GROUP BY month, source, stream_type, asset, currency
      ORDER BY month DESC, total DESC
    `);

    // OLAS salary from transactions (account_id for OLAS)
    const olasSalary = await db.execute(sql`
      SELECT
        date_trunc('month', date::date)::date AS month,
        'olas' as source, 'salary' as stream_type, 'USD' as asset, currency,
        SUM(amount::numeric)::numeric(12,2) AS total
      FROM transactions
      WHERE date >= ${from} AND date < ${to}
        AND account_id IN (SELECT id FROM financial_accounts WHERE institution = 'olas')
        AND amount::numeric > 0
      GROUP BY month, currency
      ORDER BY month DESC
    `);

    // Spending by category and currency per month
    const spending = await db.execute(sql`
      SELECT
        date_trunc('month', date::date)::date AS month,
        category, currency,
        SUM(amount::numeric)::numeric(12,2) AS total,
        COUNT(*)::int AS txn_count
      FROM transactions
      WHERE date >= ${from} AND date < ${to}
        AND amount::numeric < 0
        AND category NOT IN ('self_transfer')
        AND account_id NOT IN (SELECT id FROM financial_accounts WHERE institution = 'olas')
      GROUP BY month, category, currency
      ORDER BY month DESC, total ASC
    `);

    // Monthly totals
    const monthlyTotals = await db.execute(sql`
      SELECT
        date_trunc('month', date::date)::date AS month,
        currency,
        SUM(CASE WHEN amount::numeric < 0 THEN amount::numeric ELSE 0 END)::numeric(12,2) AS spending,
        COUNT(CASE WHEN amount::numeric < 0 THEN 1 END)::int AS spending_txns
      FROM transactions
      WHERE date >= ${from} AND date < ${to}
        AND category NOT IN ('self_transfer')
        AND account_id NOT IN (SELECT id FROM financial_accounts WHERE institution = 'olas')
      GROUP BY month, currency
      ORDER BY month DESC
    `);

    res.json({
      income: [...(yieldIncome as any[]), ...(olasSalary as any[])],
      spending: spending as any[],
      monthlyTotals: monthlyTotals as any[],
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Test the endpoint**

```bash
curl -s 'http://localhost:3000/api/finance/income-statement?from=2026-03-01&to=2026-04-01' | jq .
```

Expected: JSON with `income`, `spending`, and `monthlyTotals` arrays for March.

- [ ] **Step 3: Commit**

```bash
git add src/domains/finance/finance.routes.ts
git commit -m "feat: add income-statement API endpoint for monthly spending vs earnings"
```

---

### Task 4: Add API client method for income statement

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the income statement API method**

Add to the `api` object in `frontend/src/lib/api.ts`:

```typescript
income: {
  // ... existing methods ...
  statement: (params?: string) => apiFetch<{
    income: { month: string; source: string; stream_type: string; asset: string; currency: string; total: string }[];
    spending: { month: string; category: string; currency: string; total: string; txn_count: number }[];
    monthlyTotals: { month: string; currency: string; spending: string; spending_txns: number }[];
  }>(`/api/finance/income-statement${params ? `?${params}` : ""}`),
},
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add income-statement API client method"
```

---

### Task 5: Build the monthly income statement frontend page

**Files:**
- Create: `frontend/src/app/income-statement/page.tsx`

Build a server component page that shows monthly income vs spending with a month picker.

- [ ] **Step 1: Check Next.js 16 patterns**

```bash
cat frontend/node_modules/next/dist/docs/01-app/index.md | head -50
```

Review any breaking changes relevant to page components, searchParams, etc.

- [ ] **Step 2: Create the income statement page**

Create `frontend/src/app/income-statement/page.tsx`. The page should:

1. Accept `?month=2026-03` query param (default: previous month)
2. Show month navigation (prev/next arrows)
3. **Income section**: Table of income by source with subtotals
   - OLAS salary
   - Coinbase interest
   - DeFi yield by protocol (Morpho, Ethena, Sky, Maple, Jupiter, Lido)
   - Total income in USD
4. **Spending section**: Table of spending by category
   - Group by currency (GBP primary, then EUR, HKD, USD)
   - Show category, txn count, amount
   - Subtotals per currency
5. **Net position**: Income minus spending (with FX conversion at approximate rates)
6. **Progress indicator**: Compare against £19K/mo spending target

Use the existing UI components: Card, Table, Badge, Separator, Tabs.

The page should be a server component that reads searchParams for the month.

Key implementation details:
- Use `api.income.statement()` for data
- Group income rows by month and source
- Group spending rows by currency then category
- Use hardcoded FX rates (EUR=1.09, HKD=0.097, GBP=1.27 to USD) for the net calculation
- Color code: green for income, red for spending, bold for net
- Show the £19K target as a progress bar or comparison

```typescript
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Approximate FX rates to USD
const FX_TO_USD: Record<string, number> = { USD: 1, GBP: 1.27, EUR: 1.09, HKD: 0.128 };

function toUsd(amount: number, currency: string): number {
  return amount * (FX_TO_USD[currency] || 1);
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + "-01");
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  // Default to previous month
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
  const month = params.month || defaultMonth;
  const [year, mon] = month.split("-").map(Number);

  const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
  const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;

  const data = await api.income.statement(`from=${month}-01&to=${nextMonth}-01`);

  // --- Income ---
  const incomeRows = data.income
    .filter(r => r.month?.startsWith(month) || r.month?.startsWith(`${month}-01`))
    .sort((a, b) => Number(b.total) - Number(a.total));
  const totalIncomeUsd = incomeRows.reduce((s, r) => s + toUsd(Number(r.total), r.currency), 0);

  // --- Spending ---
  const spendingRows = data.spending
    .filter(r => r.month?.startsWith(month) || r.month?.startsWith(`${month}-01`));
  // Group by currency
  const spendingByCurrency = new Map<string, typeof spendingRows>();
  for (const row of spendingRows) {
    if (!spendingByCurrency.has(row.currency)) spendingByCurrency.set(row.currency, []);
    spendingByCurrency.get(row.currency)!.push(row);
  }
  // Sort each currency's categories by spending (most negative first)
  for (const [, rows] of spendingByCurrency) {
    rows.sort((a, b) => Number(a.total) - Number(b.total));
  }
  const totalSpendingUsd = spendingRows.reduce((s, r) => s + Math.abs(toUsd(Number(r.total), r.currency)), 0);

  // --- Net ---
  const netUsd = totalIncomeUsd - totalSpendingUsd;

  // --- Target check ---
  const gbpSpending = Math.abs(
    spendingRows.filter(r => r.currency === "GBP").reduce((s, r) => s + Number(r.total), 0)
  );
  const targetGbp = 19000;
  const targetPct = Math.min(100, Math.round((gbpSpending / targetGbp) * 100));

  // Render the page (using Cards, Tables, etc.)
  // ... full JSX implementation
}
```

- [ ] **Step 3: Add navigation link**

Add the income statement to the main nav. Check `frontend/src/app/layout.tsx` or wherever nav links are defined and add a link to `/income-statement`.

- [ ] **Step 4: Test the page**

```bash
cd frontend && npm run dev
```

Navigate to `http://localhost:3001/income-statement?month=2026-03` and verify:
- Income table shows OLAS + Coinbase + DeFi yield
- Spending table shows categories grouped by currency
- Net position is calculated
- Month navigation works
- £19K target comparison displays

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/income-statement/page.tsx frontend/src/app/layout.tsx
git commit -m "feat: add monthly income statement page with spending vs earnings view"
```

---

### Task 6: Backfill historical yield income for Oct 2025 – Feb 2026

**Files:**
- None (script execution only)

March is already backfilled. Run the yield income calculator for the months where OLAS salary is active but yield income isn't recorded.

- [ ] **Step 1: Run backfill for Oct 2025 – Feb 2026**

```bash
npx tsx scripts/calculate-yield-income.ts --range 2025-10 2026-02
```

Expected: Yield income estimates inserted for each month based on current APYs and position values. These will be APY-estimated since no snapshots exist for those months.

- [ ] **Step 2: Verify the data**

```bash
docker exec -i personal-data-store-postgres-1 psql -U pds -d personal_data_store -c "
SELECT date_trunc('month', period_start)::date as month,
  SUM(amount::numeric)::numeric(12,2) as total_yield
FROM income_streams
WHERE stream_type = 'yield' AND period_start >= '2025-10-01'
GROUP BY month ORDER BY month;
"
```

Expected: Monthly yield totals for Oct 2025 through Mar 2026.

- [ ] **Step 3: Commit**

No code changes — data backfill only.
