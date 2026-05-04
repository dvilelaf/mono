import { Router } from "express";
import {
  createWorkout,
  updateWorkout,
  getWorkout,
  listWorkouts,
  getExerciseNames,
} from "./workouts.service.js";

export const workoutsRouter = Router();

workoutsRouter.get("/", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    res.json(await listWorkouts(limit));
  } catch (err) {
    next(err);
  }
});

workoutsRouter.get("/exercises", async (req, res, next) => {
  try {
    res.json(await getExerciseNames());
  } catch (err) {
    next(err);
  }
});

workoutsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await getWorkout(req.params.id);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

workoutsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createWorkout(req.body));
  } catch (err) {
    next(err);
  }
});

workoutsRouter.patch("/:id", async (req, res, next) => {
  try {
    const row = await updateWorkout(req.params.id, req.body);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    next(err);
  }
});
