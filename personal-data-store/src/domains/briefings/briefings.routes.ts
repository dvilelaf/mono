import { Router } from "express";
import { db } from "../../db/index.js";
import { documents } from "../documents/documents.schema.js";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { runConnector } from "../../connectors/connector.runner.js";
import { briefingConnector } from "../../connectors/briefing.connector.js";

export const briefingsRouter = Router();

function startOfTodayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfTodayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

briefingsRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? "30", 10), 200);
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.domain, "briefings"), eq(documents.type, "morning-brief")))
      .orderBy(desc(documents.createdAt))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

briefingsRouter.get("/today", async (_req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(documents)
      .where(and(
        eq(documents.domain, "briefings"),
        eq(documents.type, "morning-brief"),
        gte(documents.createdAt, startOfTodayUTC()),
        lte(documents.createdAt, endOfTodayUTC()),
      ))
      .orderBy(desc(documents.createdAt))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "No briefing for today" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

briefingsRouter.get("/:id", async (req, res, next) => {
  try {
    const [row] = await db.select().from(documents).where(eq(documents.id, req.params.id)).limit(1);
    if (!row || row.domain !== "briefings") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

briefingsRouter.post("/run", async (_req, res, next) => {
  try {
    const result = await runConnector(briefingConnector);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
