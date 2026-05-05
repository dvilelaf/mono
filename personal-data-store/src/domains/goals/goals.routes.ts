import { Router } from "express";
import {
  listGoals,
  getGoalBySlug,
  createGoal,
  updateGoal,
  listObservations,
} from "./goals.service.js";
import { runProbeForSlug } from "./goals.probe.js";

export const goalsRouter = Router();

goalsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listGoals());
  } catch (err) {
    next(err);
  }
});

goalsRouter.get("/:slug", async (req, res, next) => {
  try {
    const goal = await getGoalBySlug(req.params.slug);
    if (!goal) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const observations = await listObservations(goal.id, 90);
    res.json({ ...goal, observations });
  } catch (err) {
    next(err);
  }
});

goalsRouter.get("/:slug/observations", async (req, res, next) => {
  try {
    const goal = await getGoalBySlug(req.params.slug);
    if (!goal) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const limit = req.query.limit ? Number(req.query.limit) : 90;
    res.json(await listObservations(goal.id, limit));
  } catch (err) {
    next(err);
  }
});

goalsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createGoal(req.body));
  } catch (err) {
    next(err);
  }
});

goalsRouter.put("/:slug", async (req, res, next) => {
  try {
    const row = await updateGoal(req.params.slug, req.body);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

goalsRouter.patch("/:slug", async (req, res, next) => {
  try {
    const row = await updateGoal(req.params.slug, req.body);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

goalsRouter.post("/:slug/probe", async (req, res, next) => {
  try {
    const result = await runProbeForSlug(req.params.slug);
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});
