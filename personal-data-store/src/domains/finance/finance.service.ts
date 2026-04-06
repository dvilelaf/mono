import { db } from "../../db/index.js";
import {
  wallets,
  portfolioSnapshots,
  financialAccounts,
  transactions,
  holdings,
  accountBalanceHistory,
} from "./finance.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";

// --- Wallets ---

interface CreateWalletInput {
  address: string;
  chain: string;
  label?: string;
}

export async function createWallet(input: CreateWalletInput) {
  const [row] = await db
    .insert(wallets)
    .values({
      address: input.address,
      chain: input.chain,
      label: input.label,
    })
    .returning();
  return row;
}

export async function listWallets() {
  return db.select().from(wallets).orderBy(desc(wallets.createdAt));
}

// --- Portfolio Snapshots ---

export async function queryPortfolio(filters: { walletId?: string; latest?: boolean }) {
  const conditions = [];
  if (filters.walletId) conditions.push(eq(portfolioSnapshots.walletId, filters.walletId));

  const rows = await db
    .select()
    .from(portfolioSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(portfolioSnapshots.snapshotAt));

  if (filters.latest && rows.length > 0) {
    return [rows[0]];
  }
  return rows;
}

// --- Financial Accounts ---

interface CreateAccountInput {
  institution: string;
  accountName: string;
  accountType: string;
  currency: string;
  metadata?: Record<string, unknown>;
}

export async function createAccount(input: CreateAccountInput) {
  const [row] = await db
    .insert(financialAccounts)
    .values({
      institution: input.institution,
      accountName: input.accountName,
      accountType: input.accountType,
      currency: input.currency,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function listAccounts() {
  return db.select().from(financialAccounts).orderBy(desc(financialAccounts.createdAt));
}

// --- Transactions ---

export async function queryTransactions(filters: {
  accountId?: string;
  from?: string;
  to?: string;
  category?: string;
}) {
  const conditions = [];
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters.from) conditions.push(gte(transactions.date, filters.from));
  if (filters.to) conditions.push(lte(transactions.date, filters.to));
  if (filters.category) conditions.push(eq(transactions.category, filters.category));

  return db
    .select()
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date));
}

// --- Holdings ---

export async function queryHoldings(filters: { accountId?: string; latest?: boolean }) {
  const conditions = [];
  if (filters.accountId) conditions.push(eq(holdings.accountId, filters.accountId));

  const rows = await db
    .select()
    .from(holdings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(holdings.snapshotAt));

  if (filters.latest && rows.length > 0) {
    return [rows[0]];
  }
  return rows;
}

// --- Account Balance History ---

export async function queryBalances(filters: {
  accountId?: string;
  from?: string;
  to?: string;
}) {
  const conditions = [];
  if (filters.accountId) conditions.push(eq(accountBalanceHistory.accountId, filters.accountId));
  if (filters.from) conditions.push(gte(accountBalanceHistory.snapshotAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(accountBalanceHistory.snapshotAt, new Date(filters.to)));

  return db
    .select()
    .from(accountBalanceHistory)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(accountBalanceHistory.snapshotAt));
}
