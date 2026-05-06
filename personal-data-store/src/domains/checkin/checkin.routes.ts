import { Router } from "express";
import {
  listStack,
  upsertStackItem,
  updateStackItem,
  deleteStackItem,
  recordSupplementCheckin,
  todaySupplementStatus,
  recordMeasurement,
  recordBloodPressure,
  recordNote,
  recordNutrition,
  checkinSummary,
  listMisses,
} from "./checkin.service.js";

export const checkinRouter = Router();

checkinRouter.get("/today", async (req, res, next) => {
  try {
    const summary = await checkinSummary(req.query.day as string | undefined);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

checkinRouter.get("/stack", async (req, res, next) => {
  try {
    const activeOnly = req.query.active === "true";
    const stack = await listStack({ activeOnly });
    res.json(stack);
  } catch (err) {
    next(err);
  }
});

checkinRouter.post("/stack", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.name || typeof body.name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const item = await upsertStackItem(body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

checkinRouter.patch("/stack/:id", async (req, res, next) => {
  try {
    const item = await updateStackItem(req.params.id, req.body ?? {});
    if (!item) {
      res.status(404).json({ error: "stack item not found" });
      return;
    }
    res.json(item);
  } catch (err) {
    next(err);
  }
});

checkinRouter.delete("/stack/:id", async (req, res, next) => {
  try {
    const ok = await deleteStackItem(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "stack item not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

checkinRouter.get("/supplements/today", async (req, res, next) => {
  try {
    const status = await todaySupplementStatus(req.query.day as string | undefined);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

checkinRouter.post("/supplements", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (Array.isArray(body)) {
      const out = [];
      for (const entry of body) {
        if (!entry?.name) continue;
        out.push(await recordSupplementCheckin(entry));
      }
      res.json(out);
      return;
    }
    if (!body.name || typeof body.name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const result = await recordSupplementCheckin(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

checkinRouter.post("/measurement", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.metricType || typeof body.metricType !== "string") {
      res.status(400).json({ error: "metricType is required" });
      return;
    }
    if (typeof body.value !== "number" || !Number.isFinite(body.value)) {
      res.status(400).json({ error: "value must be a finite number" });
      return;
    }
    if (!body.unit || typeof body.unit !== "string") {
      res.status(400).json({ error: "unit is required" });
      return;
    }
    const row = await recordMeasurement(body);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

checkinRouter.post("/blood-pressure", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const sys = Number(body.systolic);
    const dia = Number(body.diastolic);
    if (!Number.isFinite(sys) || sys <= 0) {
      res.status(400).json({ error: "systolic must be a positive number" });
      return;
    }
    if (!Number.isFinite(dia) || dia <= 0) {
      res.status(400).json({ error: "diastolic must be a positive number" });
      return;
    }
    const pulseRaw = body.pulse;
    const pulse =
      pulseRaw === undefined || pulseRaw === null || pulseRaw === ""
        ? null
        : Number(pulseRaw);
    if (pulse !== null && (!Number.isFinite(pulse) || pulse <= 0)) {
      res.status(400).json({ error: "pulse must be a positive number" });
      return;
    }
    const rows = await recordBloodPressure({
      systolic: sys,
      diastolic: dia,
      pulse,
      recordedAt: typeof body.recordedAt === "string" ? body.recordedAt : undefined,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    res.status(201).json(rows);
  } catch (err) {
    next(err);
  }
});

checkinRouter.post("/note", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t: unknown): t is string => typeof t === "string")
      : typeof body.tags === "string"
        ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
    const doc = await recordNote({
      content: body.content,
      title: typeof body.title === "string" ? body.title : null,
      tags,
      recordedAt: typeof body.recordedAt === "string" ? body.recordedAt : undefined,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

checkinRouter.post("/nutrition", async (req, res, next) => {
  try {
    const row = await recordNutrition(req.body ?? {});
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

checkinRouter.get("/misses", async (_req, res, next) => {
  try {
    const rows = await listMisses();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
