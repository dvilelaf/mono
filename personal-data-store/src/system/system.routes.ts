import { Router } from "express";
import { getConnectors, getConnectorRuns } from "./system.service.js";
import { getConnector } from "../connectors/scheduler.js";
import { runConnector } from "../connectors/connector.runner.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

export const systemRouter = Router();

systemRouter.get("/connectors", async (_req, res, next) => {
  try {
    const connectors = await getConnectors();
    res.json(connectors);
  } catch (err) {
    next(err);
  }
});

systemRouter.get("/connectors/:name/runs", async (req, res, next) => {
  try {
    const runs = await getConnectorRuns(req.params.name);
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

systemRouter.post("/connectors/:name/sync", async (req, res, next) => {
  try {
    const connector = getConnector(req.params.name);
    if (!connector) {
      res.status(404).json({ error: `Connector '${req.params.name}' not found` });
      return;
    }
    const options = {
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
    };
    const result = await runConnector(connector, options);
    res.json(result);
  } catch (err) { next(err); }
});

systemRouter.get("/stats", async (_req, res, next) => {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM health_metrics) AS health_metrics_count,
        (SELECT count(*) FROM workouts) AS workouts_count,
        (SELECT count(*) FROM genomics_variants) AS variants_count,
        (SELECT count(*) FROM genomics_profiles) AS profiles_count,
        (SELECT count(*) FROM transactions) AS transactions_count,
        (SELECT count(*) FROM wallets) AS wallets_count,
        (SELECT count(*) FROM portfolio_snapshots) AS snapshots_count,
        (SELECT min(recorded_at) FROM health_metrics) AS health_earliest,
        (SELECT max(recorded_at) FROM health_metrics) AS health_latest
    `);
    res.json(result[0]);
  } catch (err) {
    next(err);
  }
});
