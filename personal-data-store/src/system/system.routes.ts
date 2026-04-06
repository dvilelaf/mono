import { Router } from "express";
import { getConnectors, getConnectorRuns } from "./system.service.js";
import { getConnector } from "../connectors/scheduler.js";
import { runConnector } from "../connectors/connector.runner.js";

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
    const result = await runConnector(connector);
    res.json(result);
  } catch (err) { next(err); }
});
