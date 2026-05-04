import { Router } from "express";
import { runDigestCycle } from "./digest.connector.js";

export const digestRouter = Router();

// POST /api/digest/run — trigger a research+generation cycle immediately
digestRouter.post("/run", async (_req, res, next) => {
  try {
    console.log("[digest] Manual run triggered");
    const result = await runDigestCycle();
    res.json({
      articlesGenerated: result.articles.length,
      articles: result.articles.map((a) => ({ id: a.id, title: a.title })),
    });
  } catch (err) {
    next(err);
  }
});
