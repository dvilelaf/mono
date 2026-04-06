import { Router } from "express";
import multer from "multer";
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
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
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
