import { Router } from "express";
import { PdsClient } from "../../_shared/pds-client.js";
import { runOptimization } from "./engine.js";
import { config } from "./config.js";
import type { YieldAnalysis } from "./types.js";

const pds = new PdsClient(config.pdsUrl, config.pdsApiKey);

let lastRun: { at: string; status: "success" | "error"; error?: string } | null = null;
let latestAnalysis: YieldAnalysis | null = null;

export async function executeRun(): Promise<YieldAnalysis> {
  const positions = await pds.getYieldPositions();
  const analysis = await runOptimization(positions);

  // Store to PDS as a document of type='analysis'
  await pds.postDocument({
    domain: "yield",
    type: "analysis",
    title: `Yield Optimization — ${new Date().toISOString().slice(0, 10)}`,
    metadata: {
      analysisType: "optimization",
      summary: `Current: $${analysis.currentAnnualisedYield.toLocaleString()}/yr. Optimised: $${analysis.optimisedAnnualisedYield.toLocaleString()}/yr. ${analysis.recommendations.length} recommendations.`,
      result: analysis as unknown as Record<string, unknown>,
    },
  });

  latestAnalysis = analysis;
  lastRun = { at: new Date().toISOString(), status: "success" };
  return analysis;
}

export const router = Router();

router.get("/status", (_req, res) => {
  res.json({
    app: "yield-optimizer",
    lastRun,
    schedule: config.schedule,
    target: config.targetAnnualisedYield,
  });
});

router.get("/recommendations", async (_req, res, next) => {
  try {
    if (latestAnalysis) {
      res.json(latestAnalysis);
      return;
    }
    // Fall back to PDS
    const docs = await pds.getDocuments("yield", "analysis");
    const optimisations = docs.filter((d) => (d.metadata as { analysisType?: string } | null)?.analysisType === "optimization");
    const result = (optimisations[0]?.metadata as { result?: Record<string, unknown> } | null)?.result;
    if (result) {
      res.json(result);
      return;
    }
    res.json({ message: "No analysis available. Trigger a run with POST /api/run." });
  } catch (err) { next(err); }
});

router.post("/run", async (_req, res, next) => {
  try {
    console.log("[yield-optimizer] Manual run triggered");
    const analysis = await executeRun();
    res.json(analysis);
  } catch (err) {
    lastRun = { at: new Date().toISOString(), status: "error", error: String(err) };
    next(err);
  }
});
