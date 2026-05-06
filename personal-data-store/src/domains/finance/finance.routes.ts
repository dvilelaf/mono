import { Router } from "express";
import multer from "multer";
import { db } from "../../db/index.js";
import { sql, eq, desc as descOrder } from "drizzle-orm";
import { transactions } from "./finance.schema.js";
import { yieldPositions } from "./yield-positions.schema.js";
import {
  createWallet,
  listWallets,
  queryPortfolio,
  createAccount,
  listAccounts,
  queryTransactions,
  queryHoldings,
  queryBalances,
  importCsv,
} from "./finance.service.js";

const upload = multer({ storage: multer.memoryStorage() });

export const financeRouter = Router();

// --- Wallets ---

financeRouter.get("/wallets", async (_req, res, next) => {
  try {
    const rows = await listWallets();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

financeRouter.post("/wallets", async (req, res, next) => {
  try {
    const wallet = await createWallet(req.body);
    res.status(201).json(wallet);
  } catch (err) {
    next(err);
  }
});

// --- Portfolio ---

financeRouter.get("/portfolio", async (req, res, next) => {
  try {
    const rows = await queryPortfolio({
      walletId: req.query.wallet_id as string | undefined,
      latest: req.query.latest === "true",
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --- Accounts ---

financeRouter.get("/accounts", async (_req, res, next) => {
  try {
    const rows = await listAccounts();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

financeRouter.post("/accounts", async (req, res, next) => {
  try {
    const account = await createAccount(req.body);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

// --- Transactions ---

financeRouter.get("/transactions", async (req, res, next) => {
  try {
    const rows = await queryTransactions({
      accountId: req.query.account_id as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      category: req.query.category as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --- Yield Positions ---

financeRouter.get("/yield-positions", async (req, res, next) => {
  try {
    const rows = await db.select().from(yieldPositions).orderBy(descOrder(yieldPositions.snapshotAt));
    // Return latest snapshot per position name
    const latest = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      if (!latest.has(row.name)) latest.set(row.name, row);
    }
    res.json(Array.from(latest.values()));
  } catch (err) { next(err); }
});

// --- Income ---

financeRouter.get("/income", async (req, res, next) => {
  try {
    const { incomeStreams } = await import("./income.schema.js");
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const source = req.query.source as string | undefined;

    const fromFilter = from ? sql`AND period_start >= ${from}` : sql``;
    const toFilter = to ? sql`AND period_end <= ${to}` : sql``;
    const sourceFilter = source ? sql`AND source = ${source}` : sql``;

    const result = await db.execute(sql`
      SELECT * FROM income_streams
      WHERE true ${fromFilter} ${toFilter} ${sourceFilter}
      ORDER BY period_start DESC
    `);
    res.json(result);
  } catch (err) { next(err); }
});

financeRouter.get("/income/summary", async (req, res, next) => {
  try {
    const from = req.query.from as string || "2025-01-01";

    const bySource = await db.execute(sql`
      SELECT source, stream_type, currency,
        count(*)::int AS entries,
        round(sum(amount::numeric)::numeric, 2) AS total
      FROM income_streams
      WHERE period_start >= ${from}
      GROUP BY source, stream_type, currency
      ORDER BY total DESC
    `);

    const byMonth = await db.execute(sql`
      SELECT date_trunc('month', period_start)::date AS month,
        source, currency,
        round(sum(amount::numeric)::numeric, 2) AS total
      FROM income_streams
      WHERE period_start >= ${from}
      GROUP BY month, source, currency
      ORDER BY month DESC, total DESC
    `);

    res.json({ bySource, byMonth });
  } catch (err) { next(err); }
});

// --- Merchants ---

financeRouter.get("/merchants", async (req, res, next) => {
  try {
    const accountId = req.query.account_id as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const accountFilter = accountId ? sql`AND t.account_id = ${accountId}` : sql``;
    const fromFilter = from ? sql`AND t.date >= ${from}` : sql``;
    const toFilter = to ? sql`AND t.date <= ${to}` : sql``;
    const result = await db.execute(sql`
      SELECT
        t.description,
        t.category,
        t.currency,
        count(*)::int AS txns,
        round(sum(CASE WHEN t.amount::numeric < 0 THEN abs(t.amount::numeric) ELSE 0 END)::numeric, 2) AS total_out,
        round(sum(CASE WHEN t.amount::numeric > 0 THEN t.amount::numeric ELSE 0 END)::numeric, 2) AS total_in,
        min(t.date) AS first_date,
        max(t.date) AS last_date
      FROM transactions t
      WHERE true ${accountFilter} ${fromFilter} ${toFilter}
      GROUP BY t.description, t.category, t.currency
      ORDER BY total_out DESC
    `);
    res.json(result);
  } catch (err) { next(err); }
});

// --- Transaction Category Update ---

financeRouter.put("/transactions/:id/category", async (req, res, next) => {
  try {
    const { category } = req.body;
    if (!category) { res.status(400).json({ error: "category is required" }); return; }
    const [row] = await db.update(transactions).set({ category }).where(eq(transactions.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

// Bulk update category by merchant name
financeRouter.put("/transactions/category/bulk", async (req, res, next) => {
  try {
    const { description, category } = req.body;
    if (!description || !category) { res.status(400).json({ error: "description and category required" }); return; }
    const result = await db.update(transactions).set({ category }).where(eq(transactions.description, description)).returning({ id: transactions.id });
    res.json({ updated: result.length });
  } catch (err) { next(err); }
});

// --- Holdings ---

financeRouter.get("/holdings", async (req, res, next) => {
  try {
    const rows = await queryHoldings({
      accountId: req.query.account_id as string | undefined,
      latest: req.query.latest === "true",
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --- Balances ---

financeRouter.get("/balances", async (req, res, next) => {
  try {
    const rows = await queryBalances({
      accountId: req.query.account_id as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --- Spending Analysis ---

// Categories excluded from "discretionary" spending totals — these are
// transfers, income, taxes, property/vehicle/investment moves, or already
// excluded from the £19K/mo lifestyle target.
const SPEND_EXCLUDED_CATEGORIES = [
  "self_transfer",
  "other",
  "income",
  "property",
  "tax",
  "investment",
  "vehicle",
] as const;

function monthRange(month: string): { from: string; to: string; daysInMonth: number } {
  // month: "YYYY-MM"
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error("month must be in YYYY-MM format");
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(end.getUTCDate())}`,
    daysInMonth: end.getUTCDate(),
  };
}

financeRouter.get("/spending", async (req, res, next) => {
  try {
    const accountId = req.query.account_id as string | undefined;
    const month = req.query.month as string | undefined;

    let from: string;
    let to: string;
    if (month) {
      const r = monthRange(month);
      from = r.from;
      to = r.to;
    } else {
      from = (req.query.from as string) || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    }

    const accountFilter = accountId ? sql`AND t.account_id = ${accountId}` : sql``;

    const database = db;

    // Monthly spending by category
    const monthly = await database.execute(sql`
      SELECT
        date_trunc('month', t.date::date)::date AS month,
        t.currency,
        t.metadata->>'type' AS tx_type,
        count(*)::int AS txns,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS total
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.date >= ${from} AND t.date <= ${to}
        AND t.category NOT IN ('self_transfer', 'other', 'income', 'property', 'tax', 'investment', 'vehicle')
        ${accountFilter}
      GROUP BY month, t.currency, tx_type
      ORDER BY month DESC, total DESC
    `);

    // Top merchants/descriptions
    const topMerchants = await database.execute(sql`
      SELECT
        t.description,
        t.currency,
        count(*)::int AS txns,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS total
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.date >= ${from} AND t.date <= ${to}
        AND t.category NOT IN ('self_transfer', 'other', 'income', 'property', 'tax', 'investment', 'vehicle')
        ${accountFilter}
      GROUP BY t.description, t.currency
      ORDER BY total DESC
      LIMIT 30
    `);

    // Monthly totals (all spending types combined)
    const monthlyTotals = await database.execute(sql`
      SELECT
        date_trunc('month', t.date::date)::date AS month,
        t.currency,
        count(*)::int AS txns,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS total
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.date >= ${from} AND t.date <= ${to}
        AND t.category NOT IN ('self_transfer', 'other', 'income', 'property', 'tax', 'investment', 'vehicle')
        ${accountFilter}
      GROUP BY month, t.currency
      ORDER BY month DESC
    `);

    // By category
    const byCategory = await database.execute(sql`
      SELECT
        t.category,
        t.currency,
        count(*)::int AS txns,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS total
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.date >= ${from} AND t.date <= ${to}
        AND t.category NOT IN ('self_transfer', 'other', 'income', 'property', 'tax', 'investment', 'vehicle')
        ${accountFilter}
      GROUP BY t.category, t.currency
      ORDER BY total DESC
    `);

    res.json({ monthly, topMerchants, monthlyTotals, byCategory });
  } catch (err) { next(err); }
});

// --- Spending Burn (monthly target tracker) ---

// Default monthly spending target in GBP. Mirrors the `monthly-spend-19k-gbp` goal.
const MONTHLY_SPEND_TARGET_GBP = 19000;

financeRouter.get("/spending/burn", async (req, res, next) => {
  try {
    const now = new Date();
    const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const month = (req.query.month as string) || defaultMonth;
    const currency = ((req.query.currency as string) || "GBP").toUpperCase();
    const targetParam = req.query.target ? Number(req.query.target) : undefined;
    const target = Number.isFinite(targetParam) && targetParam ? (targetParam as number) : MONTHLY_SPEND_TARGET_GBP;

    const { from, to, daysInMonth } = monthRange(month);

    // Days elapsed within the month (clamped to [1, daysInMonth])
    const today = new Date();
    let daysElapsed: number;
    const todayIso = today.toISOString().slice(0, 10);
    if (todayIso < from) {
      daysElapsed = 0;
    } else if (todayIso > to) {
      daysElapsed = daysInMonth;
    } else {
      daysElapsed = Number(todayIso.slice(8, 10));
    }

    const excluded = sql.raw(
      "(" + SPEND_EXCLUDED_CATEGORIES.map((c) => `'${c}'`).join(",") + ")",
    );

    const mtdRows = (await db.execute(sql`
      SELECT
        round(coalesce(sum(abs(t.amount::numeric)), 0)::numeric, 2) AS total,
        count(*)::int AS txns
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.currency = ${currency}
        AND t.date >= ${from} AND t.date <= ${to}
        AND (t.category IS NULL OR t.category NOT IN ${excluded})
    `)) as unknown as Array<{ total: string; txns: number }>;
    const mtdTotal = Number(mtdRows[0]?.total ?? 0);
    const mtdTxns = Number(mtdRows[0]?.txns ?? 0);

    const byCategory = (await db.execute(sql`
      SELECT
        coalesce(t.category, 'uncategorised') AS category,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS total,
        count(*)::int AS txns
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.currency = ${currency}
        AND t.date >= ${from} AND t.date <= ${to}
        AND (t.category IS NULL OR t.category NOT IN ${excluded})
      GROUP BY coalesce(t.category, 'uncategorised')
      ORDER BY total DESC
    `)) as unknown as Array<{ category: string; total: string; txns: number }>;

    const topMerchants = (await db.execute(sql`
      SELECT
        t.description,
        coalesce(t.category, 'uncategorised') AS category,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS total,
        count(*)::int AS txns
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.currency = ${currency}
        AND t.date >= ${from} AND t.date <= ${to}
        AND (t.category IS NULL OR t.category NOT IN ${excluded})
      GROUP BY t.description, coalesce(t.category, 'uncategorised')
      ORDER BY total DESC
      LIMIT 15
    `)) as unknown as Array<{ description: string; category: string; total: string; txns: number }>;

    // Subscriptions due within the remaining month — convert frequency to a
    // monthly-equivalent amount where dates are unknown.
    const upcomingSubs = (await db.execute(sql`
      SELECT name, description, amount, currency, frequency, next_expected, category
      FROM subscriptions
      WHERE status = 'active'
        AND currency = ${currency}
        AND next_expected IS NOT NULL
        AND next_expected >= ${from}
        AND next_expected <= ${to}
        AND next_expected > current_date
      ORDER BY next_expected ASC
    `)) as unknown as Array<{
      name: string;
      description: string;
      amount: string;
      currency: string;
      frequency: string;
      next_expected: string;
      category: string | null;
    }>;
    const forecastSubsTotal = upcomingSubs.reduce((s, r) => s + Number(r.amount || 0), 0);

    const dailyAvg = daysElapsed > 0 ? mtdTotal / daysElapsed : 0;
    const projectedTotal = dailyAvg * daysInMonth;
    const projectedTotalWithSubs = mtdTotal + forecastSubsTotal + dailyAvg * Math.max(0, daysInMonth - daysElapsed);
    const remainingBudget = target - mtdTotal;
    const dailyBudgetRemaining = daysInMonth - daysElapsed > 0
      ? remainingBudget / (daysInMonth - daysElapsed)
      : 0;

    res.json({
      month,
      currency,
      target,
      from,
      to,
      daysInMonth,
      daysElapsed,
      mtd: {
        total: mtdTotal,
        txns: mtdTxns,
      },
      pace: {
        dailyAvg: Number(dailyAvg.toFixed(2)),
        projectedTotal: Number(projectedTotal.toFixed(2)),
        projectedTotalWithSubs: Number(projectedTotalWithSubs.toFixed(2)),
        remainingBudget: Number(remainingBudget.toFixed(2)),
        dailyBudgetRemaining: Number(dailyBudgetRemaining.toFixed(2)),
        percentUsed: target > 0 ? Number(((mtdTotal / target) * 100).toFixed(1)) : 0,
        onTrack: projectedTotalWithSubs <= target,
      },
      byCategory: byCategory.map((c) => ({
        category: c.category,
        total: Number(c.total),
        txns: Number(c.txns),
      })),
      topMerchants: topMerchants.map((m) => ({
        description: m.description,
        category: m.category,
        total: Number(m.total),
        txns: Number(m.txns),
      })),
      forecastSubscriptions: {
        total: Number(forecastSubsTotal.toFixed(2)),
        items: upcomingSubs.map((s) => ({
          name: s.name,
          description: s.description,
          amount: Number(s.amount),
          frequency: s.frequency,
          nextExpected: s.next_expected,
          category: s.category,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// --- Income Statement ---

financeRouter.get("/income-statement", async (req, res, next) => {
  try {
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const from = req.query.from as string || defaultFrom;
    const to = req.query.to as string | undefined;

    const fromFilter = sql`AND period_start >= ${from}`;
    const toFilter = to ? sql`AND period_end <= ${to}` : sql``;
    const txFromFilter = sql`AND t.date >= ${from}`;
    const txToFilter = to ? sql`AND t.date <= ${to}` : sql``;

    // Income from income_streams (yield, interest, etc.) — filter out dust amounts
    const incomeFromStreams = await db.execute(sql`
      SELECT
        date_trunc('month', period_start)::date AS month,
        source,
        stream_type,
        asset,
        currency,
        round(sum(amount::numeric)::numeric, 6) AS total
      FROM income_streams
      WHERE amount::numeric >= 0.01
        ${fromFilter} ${toFilter}
      GROUP BY month, source, stream_type, asset, currency
      ORDER BY month DESC, total DESC
    `);

    // OLAS salary from transactions table (account institution = 'olas')
    const olasAccountId = "05e029b8-bca3-44ba-8f8b-e416a1fdadd7";
    const incomeFromOlas = await db.execute(sql`
      SELECT
        date_trunc('month', t.date::date)::date AS month,
        'olas' AS source,
        'salary' AS stream_type,
        NULL AS asset,
        t.currency,
        round(sum(t.amount::numeric)::numeric, 2) AS total
      FROM transactions t
      WHERE t.account_id = ${olasAccountId}
        AND t.amount::numeric > 0
        ${txFromFilter} ${txToFilter}
      GROUP BY month, t.currency
      ORDER BY month DESC
    `);

    const income = [...(incomeFromStreams as unknown[]), ...(incomeFromOlas as unknown[])];

    // Spending: negative transactions, excluding self_transfer and OLAS account
    const spending = await db.execute(sql`
      SELECT
        date_trunc('month', t.date::date)::date AS month,
        t.category,
        t.currency,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS total,
        count(*)::int AS txn_count
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.category != 'self_transfer'
        AND t.account_id != ${olasAccountId}
        ${txFromFilter} ${txToFilter}
      GROUP BY month, t.category, t.currency
      ORDER BY month DESC, total DESC
    `);

    // Monthly spending totals per currency
    const monthlyTotals = await db.execute(sql`
      SELECT
        date_trunc('month', t.date::date)::date AS month,
        t.currency,
        round(sum(abs(t.amount::numeric))::numeric, 2) AS spending,
        count(*)::int AS spending_txns
      FROM transactions t
      WHERE t.amount::numeric < 0
        AND t.category != 'self_transfer'
        AND t.account_id != ${olasAccountId}
        ${txFromFilter} ${txToFilter}
      GROUP BY month, t.currency
      ORDER BY month DESC
    `);

    res.json({ income, spending, monthlyTotals });
  } catch (err) { next(err); }
});

// --- Subscriptions ---

financeRouter.get("/subscriptions/summary", async (_req, res, next) => {
  try {
    const result = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'active')::int AS active_count,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
        count(*) FILTER (WHERE status = 'paused')::int AS paused_count,
        currency,
        round(sum(CASE
          WHEN status = 'active' AND frequency = 'monthly' THEN amount::numeric
          WHEN status = 'active' AND frequency = 'yearly' THEN amount::numeric / 12
          WHEN status = 'active' AND frequency = 'quarterly' THEN amount::numeric / 3
          ELSE 0
        END)::numeric, 2) AS monthly_total,
        round(sum(CASE
          WHEN status = 'active' AND frequency = 'yearly' THEN amount::numeric
          WHEN status = 'active' AND frequency = 'monthly' THEN amount::numeric * 12
          WHEN status = 'active' AND frequency = 'quarterly' THEN amount::numeric * 4
          ELSE 0
        END)::numeric, 2) AS yearly_total
      FROM subscriptions
      GROUP BY currency
    `);
    res.json(result);
  } catch (err) { next(err); }
});

financeRouter.get("/subscriptions", async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const statusFilter = status ? sql`AND status = ${status}` : sql``;
    const result = await db.execute(sql`
      SELECT * FROM subscriptions
      WHERE true ${statusFilter}
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
        amount::numeric DESC
    `);
    res.json(result);
  } catch (err) { next(err); }
});

// --- CSV Import ---

financeRouter.post("/import/csv", upload.single("file"), async (req, res, next) => {
  try {
    const accountId = req.body.account_id as string | undefined;
    if (!accountId) {
      res.status(400).json({ error: "account_id is required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const csvContent = req.file.buffer.toString("utf-8");
    const institution = req.body.institution as string | undefined;
    const result = await importCsv(accountId, csvContent, institution);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
