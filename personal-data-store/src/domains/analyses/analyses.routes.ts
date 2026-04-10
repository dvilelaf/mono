import { Router } from "express";
import { db } from "../../db/index.js";
import { analyses } from "./analyses.schema.js";
import { eq, desc } from "drizzle-orm";

export const analysesRouter = Router();

analysesRouter.get("/", async (req, res, next) => {
  try {
    const conditions = [];
    if (req.query.domain) conditions.push(eq(analyses.domain, req.query.domain as string));
    if (req.query.type) conditions.push(eq(analyses.analysisType, req.query.type as string));

    const rows = await db.select().from(analyses)
      .where(conditions.length ? conditions[0] : undefined)
      .orderBy(desc(analyses.createdAt));
    res.json(rows);
  } catch (err) { next(err); }
});

analysesRouter.get("/:id", async (req, res, next) => {
  try {
    const [row] = await db.select().from(analyses).where(eq(analyses.id, req.params.id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});
