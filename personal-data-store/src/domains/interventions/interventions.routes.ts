import { Router } from "express";
import {
  listInterventions,
  getInterventionBySlug,
  createIntervention,
  updateIntervention,
  listObservations,
  evaluateInterventionBySlug,
  listLatestObservationsForAll,
  listInterventionsByGoalSlug,
} from "./interventions.service.js";

export const interventionsRouter = Router();

interventionsRouter.get("/", async (req, res, next) => {
  try {
    const { status, domain } = req.query;
    res.json(
      await listInterventions({
        status: typeof status === "string" ? status : undefined,
        domain: typeof domain === "string" ? domain : undefined,
      }),
    );
  } catch (err) {
    next(err);
  }
});

interventionsRouter.get("/observations/latest", async (_req, res, next) => {
  try {
    res.json(await listLatestObservationsForAll());
  } catch (err) {
    next(err);
  }
});

interventionsRouter.get("/by-goal/:goalSlug", async (req, res, next) => {
  try {
    res.json(await listInterventionsByGoalSlug(req.params.goalSlug));
  } catch (err) {
    next(err);
  }
});

interventionsRouter.get("/:slug", async (req, res, next) => {
  try {
    const intervention = await getInterventionBySlug(req.params.slug);
    if (!intervention) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const observations = await listObservations(intervention.id, 90);
    res.json({ ...intervention, observations });
  } catch (err) {
    next(err);
  }
});

interventionsRouter.get("/:slug/observations", async (req, res, next) => {
  try {
    const intervention = await getInterventionBySlug(req.params.slug);
    if (!intervention) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const limit = req.query.limit ? Number(req.query.limit) : 90;
    res.json(await listObservations(intervention.id, limit));
  } catch (err) {
    next(err);
  }
});

interventionsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createIntervention(req.body));
  } catch (err) {
    next(err);
  }
});

interventionsRouter.put("/:slug", async (req, res, next) => {
  try {
    const row = await updateIntervention(req.params.slug, req.body);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

interventionsRouter.patch("/:slug", async (req, res, next) => {
  try {
    const row = await updateIntervention(req.params.slug, req.body);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

interventionsRouter.post("/:slug/evaluate", async (req, res, next) => {
  try {
    const result = await evaluateInterventionBySlug(req.params.slug);
    if (result === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ slug: req.params.slug, evaluations: result });
  } catch (err) {
    next(err);
  }
});
