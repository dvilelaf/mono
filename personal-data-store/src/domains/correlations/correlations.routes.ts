import { Router } from "express";
import { listSpecs, runAllSpecs, runSpec, getSpec } from "./correlations.service.js";

export const correlationsRouter = Router();

correlationsRouter.get("/", (_req, res) => {
  res.json({ specs: listSpecs() });
});

correlationsRouter.post("/run", async (req, res, next) => {
  try {
    const persist = req.body?.persist !== false;
    const slug = typeof req.body?.slug === "string" ? req.body.slug : null;
    if (slug) {
      const spec = getSpec(slug);
      if (!spec) {
        res.status(404).json({ error: `unknown spec: ${slug}` });
        return;
      }
      const result = await runSpec(spec, { persist });
      res.json({ runs: [result] });
      return;
    }
    const results = await runAllSpecs({ persist });
    res.json({ runs: results });
  } catch (err) {
    next(err);
  }
});
