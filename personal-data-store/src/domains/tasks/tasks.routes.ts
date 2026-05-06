import { Router } from "express";
import {
  listTasks,
  listTopOpenTasks,
  getTaskBySlug,
  createTask,
  updateTask,
  markTaskDone,
  reopenTask,
  listTasksByGoalSlug,
  countOpenTasks,
} from "./tasks.service.js";

export const tasksRouter = Router();

tasksRouter.get("/", async (req, res, next) => {
  try {
    const { status, goal } = req.query;
    res.json(
      await listTasks({
        status: typeof status === "string" ? status : undefined,
        goalSlug: typeof goal === "string" ? goal : undefined,
      }),
    );
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/top", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Math.min(20, Math.max(1, Number(req.query.limit))) : 3;
    res.json(await listTopOpenTasks(limit));
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/count", async (_req, res, next) => {
  try {
    res.json({ open: await countOpenTasks() });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/by-goal/:goalSlug", async (req, res, next) => {
  try {
    res.json(await listTasksByGoalSlug(req.params.goalSlug));
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/:slug", async (req, res, next) => {
  try {
    const row = await getTaskBySlug(req.params.slug);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createTask(req.body));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/:slug", async (req, res, next) => {
  try {
    const row = await updateTask(req.params.slug, req.body);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tasksRouter.put("/:slug", async (req, res, next) => {
  try {
    const row = await updateTask(req.params.slug, req.body);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/:slug/done", async (req, res, next) => {
  try {
    const row = await markTaskDone(req.params.slug, typeof req.body?.completedBy === "string" ? req.body.completedBy : null);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/:slug/reopen", async (req, res, next) => {
  try {
    const row = await reopenTask(req.params.slug);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});
