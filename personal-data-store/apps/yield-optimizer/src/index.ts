import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { router, executeRun } from "./routes.js";
import { config } from "./config.js";

const app = express();
app.use(express.json());
app.use("/api", router);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Schedule
if (cron.validate(config.schedule)) {
  cron.schedule(config.schedule, async () => {
    console.log(`[yield-optimizer] Scheduled run starting at ${new Date().toISOString()}`);
    try {
      const result = await executeRun();
      console.log(`[yield-optimizer] Done. Current: $${result.currentAnnualisedYield}/yr, ${result.recommendations.length} recommendations`);
    } catch (err) {
      console.error("[yield-optimizer] Scheduled run failed:", err);
    }
  });
  console.log(`[yield-optimizer] Cron scheduled: ${config.schedule}`);
}

app.listen(config.port, () => {
  console.log(`[yield-optimizer] Running on http://localhost:${config.port}`);
  console.log(`[yield-optimizer] PDS: ${config.pdsUrl}`);
  console.log(`[yield-optimizer] Target: $${config.targetAnnualisedYield.toLocaleString()}/yr`);
});
