import { Router } from "express";
import {
  createClient,
  queryClients,
  createProject,
  queryProjects,
  createTimeEntry,
  queryTimeEntries,
  createInvoice,
  queryInvoices,
  createExpense,
  queryExpenses,
} from "./business.service.js";

export const businessRouter = Router();

// --- Clients ---

businessRouter.get("/clients", async (req, res, next) => {
  try {
    const rows = await queryClients({
      status: req.query.status as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

businessRouter.post("/clients", async (req, res, next) => {
  try {
    const client = await createClient(req.body);
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
});

// --- Projects ---

businessRouter.get("/projects", async (req, res, next) => {
  try {
    const rows = await queryProjects({
      clientId: req.query.client_id as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

businessRouter.post("/projects", async (req, res, next) => {
  try {
    const project = await createProject(req.body);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// --- Time Entries ---

businessRouter.get("/time", async (req, res, next) => {
  try {
    const rows = await queryTimeEntries({
      projectId: req.query.project_id as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

businessRouter.post("/time", async (req, res, next) => {
  try {
    const entry = await createTimeEntry(req.body);
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

// --- Invoices ---

businessRouter.get("/invoices", async (req, res, next) => {
  try {
    const rows = await queryInvoices({
      clientId: req.query.client_id as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

businessRouter.post("/invoices", async (req, res, next) => {
  try {
    const invoice = await createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
});

// --- Expenses ---

businessRouter.get("/expenses", async (req, res, next) => {
  try {
    const rows = await queryExpenses({
      category: req.query.category as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

businessRouter.post("/expenses", async (req, res, next) => {
  try {
    const expense = await createExpense(req.body);
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});
