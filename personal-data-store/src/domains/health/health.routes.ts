import { Router } from "express";
import {
  createMetric,
  queryMetrics,
  latestMetric,
  createSupplement,
  querySupplements,
  queryNutrition,
  queryWorkouts,
} from "./health.service.js";
import { checkinRouter } from "../checkin/checkin.routes.js";

export const healthRouter = Router();

healthRouter.use("/checkin", checkinRouter);

healthRouter.get("/metrics", async (req, res, next) => {
  try {
    const metrics = await queryMetrics({
      type: req.query.type as string | undefined,
      source: req.query.source as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(metrics);
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/metrics/latest", async (req, res, next) => {
  try {
    const type = req.query.type as string;
    if (!type) {
      res.status(400).json({ error: "type query parameter is required" });
      return;
    }
    const metric = await latestMetric(type);
    if (!metric) {
      res.status(404).json({ error: "No metrics found for this type" });
      return;
    }
    res.json(metric);
  } catch (err) {
    next(err);
  }
});

healthRouter.post("/metrics", async (req, res, next) => {
  try {
    const metric = await createMetric(req.body);
    res.status(201).json(metric);
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/supplements", async (req, res, next) => {
  try {
    const supplements = await querySupplements({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(supplements);
  } catch (err) {
    next(err);
  }
});

healthRouter.post("/supplements", async (req, res, next) => {
  try {
    const supplement = await createSupplement(req.body);
    res.status(201).json(supplement);
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/nutrition", async (req, res, next) => {
  try {
    const entries = await queryNutrition({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/workouts", async (req, res, next) => {
  try {
    const workouts = await queryWorkouts({
      name: req.query.name as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(workouts);
  } catch (err) {
    next(err);
  }
});
