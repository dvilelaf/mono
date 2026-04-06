import { Router } from "express";
import {
  createDocument,
  getDocument,
  queryDocuments,
  semanticSearch,
} from "./documents.service.js";

export const documentsRouter = Router();

// GET / — query documents (params: domain, from, to)
documentsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await queryDocuments({
      domain: req.query.domain as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id — single document
documentsRouter.get("/:id", async (req, res, next) => {
  try {
    const doc = await getDocument(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// POST / — create document
documentsRouter.post("/", async (req, res, next) => {
  try {
    const doc = await createDocument(req.body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// POST /search — semantic search (body: { query, limit })
documentsRouter.post("/search", async (req, res, next) => {
  try {
    const { query, limit } = req.body as { query: string; limit?: number };
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    const results = await semanticSearch(query, limit ?? 10);
    res.json(results);
  } catch (err) {
    next(err);
  }
});
