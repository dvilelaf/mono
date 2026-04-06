import { pgTable, uuid, text, numeric, date, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull(),
  chain: text("chain").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id").references(() => wallets.id),
    totalValueUsd: numeric("total_value_usd"),
    positions: jsonb("positions"),
    source: text("source").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("portfolio_snapshots_wallet_time_idx").on(table.walletId, table.snapshotAt),
  ]
);

export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  institution: text("institution").notNull(),
  accountName: text("account_name").notNull(),
  accountType: text("account_type").notNull(),
  currency: text("currency").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => financialAccounts.id),
    date: date("date").notNull(),
    description: text("description").notNull(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull(),
    category: text("category"),
    balanceAfter: numeric("balance_after"),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("transactions_account_date_idx").on(table.accountId, table.date),
    index("transactions_category_idx").on(table.category),
    unique("transactions_account_source_ref_uniq").on(table.accountId, table.sourceRef).nullsNotDistinct(),
  ]
);

export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => financialAccounts.id),
    symbol: text("symbol").notNull(),
    quantity: numeric("quantity").notNull(),
    costBasis: numeric("cost_basis"),
    marketValue: numeric("market_value").notNull(),
    currency: text("currency").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    source: text("source"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("holdings_account_time_idx").on(table.accountId, table.snapshotAt),
  ]
);

export const accountBalanceHistory = pgTable(
  "account_balance_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => financialAccounts.id),
    balance: numeric("balance").notNull(),
    currency: text("currency").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("balance_history_account_time_idx").on(table.accountId, table.snapshotAt),
  ]
);
