import { Router } from "express";
import {
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  semanticSearch,
} from "./documents.service.js";
import { hybridSearch } from "./search-v2.js";

export const documentsRouter = Router();

// GET / — query documents (params: domain, type, from, to)
documentsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await queryDocuments({
      domain: req.query.domain as string | undefined,
      type: req.query.type as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /indexer-status — health/status for the v2 indexer
documentsRouter.get("/indexer-status", async (_req, res, next) => {
  try {
    res.json(await getIndexerStatus());
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

// PATCH /:id — update document fields (domain, type, title, content, source, metadata)
documentsRouter.patch("/:id", async (req, res, next) => {
  try {
    const doc = await updateDocument(req.params.id, req.body);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id — remove document and its embeddings
documentsRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteDocument(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /search — semantic search (body: { query, limit })
documentsRouter.post("/search", async (req, res, next) => {
  try {
    const { query, limit, fileOnly } = req.body as { query: string; limit?: number; fileOnly?: boolean };
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    const results = await semanticSearch(query, limit ?? 10, { fileOnly: fileOnly ?? true });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// POST /search-v2 — hybrid (vector + keyword) chunk-level search
documentsRouter.post("/search-v2", async (req, res, next) => {
  try {
    const { query, limit } = req.body as { query: string; limit?: number };
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    const results = await hybridSearch(query, limit ?? 10);
    res.json(results);
  } catch (err) {
    next(err);
  }
});
