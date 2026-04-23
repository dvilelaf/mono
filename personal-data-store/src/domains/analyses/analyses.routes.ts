import { Router } from "express";
import { db } from "../../db/index.js";
import { analyses } from "./analyses.schema.js";
import { eq, and, desc } from "drizzle-orm";

export const analysesRouter = Router();

analysesRouter.get("/", async (req, res, next) => {
  try {
    const conditions = [];
    if (req.query.domain) conditions.push(eq(analyses.domain, req.query.domain as string));
    if (req.query.type) conditions.push(eq(analyses.analysisType, req.query.type as string));

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const rows = await db.select().from(analyses)
      .where(where)
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

analysesRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as {
      domain: string;
      analysisType: string;
      title: string;
      summary?: string;
      content?: string;
      confidence?: string;
      entities?: Record<string, unknown>;
      result?: Record<string, unknown>;
      sourceQuery?: Record<string, unknown>;
      parentId?: string;
      source?: string;
    };
    const [row] = await db.insert(analyses).values({
      domain: body.domain,
      analysisType: body.analysisType,
      title: body.title,
      summary: body.summary,
      content: body.content,
      confidence: body.confidence,
      entities: body.entities,
      result: body.result,
      sourceQuery: body.sourceQuery,
      parentId: body.parentId,
      source: body.source,
    }).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});
