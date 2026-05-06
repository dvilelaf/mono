import { Router } from "express";
import { runDecide } from "./decide.service.js";

export const decideRouter = Router();

// POST /api/decide — { question: string, context?: string }
decideRouter.post("/", async (req, res, next) => {
  try {
    const { question, context } = (req.body ?? {}) as {
      question?: unknown;
      context?: unknown;
    };
    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({ error: "question is required (string)" });
      return;
    }
    if (context !== undefined && typeof context !== "string") {
      res.status(400).json({ error: "context must be a string when provided" });
      return;
    }
    const result = await runDecide({ question, context });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
