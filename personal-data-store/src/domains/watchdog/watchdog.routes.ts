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

// External callers (e.g. the wiki-jobs eval harness) report a single alert.
// Same dedupe semantics as internal checks: one open row per fingerprint.
watchdogRouter.post("/report", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const required = ["checkType", "severity", "subject", "title", "fingerprint"];
    for (const k of required) {
      if (typeof body[k] !== "string" || !body[k]) {
        return res.status(400).json({ error: `missing field: ${k}` });
      }
    }
    if (!["info", "warning", "critical"].includes(body.severity)) {
      return res.status(400).json({ error: "severity must be info|warning|critical" });
    }
    const r = await upsertAlert({
      checkType: body.checkType,
      severity: body.severity,
      subject: body.subject,
      title: body.title,
      detail: typeof body.detail === "string" ? body.detail : undefined,
      fingerprint: body.fingerprint,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    });
    res.json({ inserted: r.inserted, id: r.alert.id, checkType: r.alert.checkType });
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
