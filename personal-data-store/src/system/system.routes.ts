import { Router } from "express";
import { getConnectors, getConnectorRuns } from "./system.service.js";

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
