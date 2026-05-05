import { Router } from "express";
import { listAlerts, resolveAlert, runAllChecks, upsertAlert } from "./watchdog.service.js";

export const watchdogRouter = Router();

watchdogRouter.get("/", async (req, res, next) => {
  try {
    const resolvedParam = req.query.resolved;
    const resolved = resolvedParam === undefined ? undefined : resolvedParam === "true";
    const limit = req.query.limit ? Math.min(500, parseInt(String(req.query.limit), 10) || 100) : 100;
    const rows = await listAlerts({ resolved, limit });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

watchdogRouter.post("/run", async (_req, res, next) => {
  try {
    const { alerts } = await runAllChecks();
    const out: Array<{ inserted: boolean; id: string; checkType: string; severity: string; title: string }> = [];
    for (const a of alerts) {
      const r = await upsertAlert(a);
      out.push({ inserted: r.inserted, id: r.alert.id, checkType: r.alert.checkType, severity: r.alert.severity, title: r.alert.title });
    }
    res.json({ checks: alerts.length, newAlerts: out.filter((x) => x.inserted).length, results: out });
  } catch (err) {
    next(err);
  }
});

watchdogRouter.patch("/:id/resolve", async (req, res, next) => {
  try {
    const row = await resolveAlert(req.params.id);
    if (!row) {
      res.status(404).json({ error: "alert not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});
