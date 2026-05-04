import { Router } from "express";
import { getCanonicalDocuments } from "./documents.service.js";

export const canonicalRouter = Router();

// GET /api/canonical?topics=fitness.strength,fitness.muscle_growth
canonicalRouter.get("/", async (req, res, next) => {
  try {
    const raw = (req.query.topics ?? "") as string;
    const topics = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!topics.length) {
      res.status(400).json({ error: "topics query parameter is required (comma-separated)" });
      return;
    }
    const docs = await getCanonicalDocuments(topics);
    res.json({ topics, count: docs.length, documents: docs });
  } catch (err) {
    next(err);
  }
});
