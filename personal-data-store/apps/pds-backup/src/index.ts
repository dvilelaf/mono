import express from "express";
import cron from "node-cron";
import { config } from "./config.js";
import { dump } from "./dump.js";
import { prune } from "./retention.js";

let running = false;

async function runBackupCycle() {
  if (running) {
    console.log("[pds-backup] skip — already running");
    return;
  }
  running = true;
  try {
    console.log("[pds-backup] dump starting");
    const r = await dump();
    console.log(
      `[pds-backup] dump done: ${r.file} (${r.bytes} bytes)` +
        (r.mirrored ? ` → mirrored: ${r.mirrored}` : ""),
    );
    const p = await prune();
    if (p.pruned.length > 0) {
      console.log(`[pds-backup] pruned ${p.pruned.length} old dumps, kept ${p.kept}`);
    }
  } catch (err) {
    console.error("[pds-backup] dump failed:", err);
  } finally {
    running = false;
  }
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/status", (_req, res) =>
  res.json({
    backupDir: config.backupDir,
    icloudBackupDir: config.icloudBackupDir || null,
    cron: config.cron,
    cronEnabled: config.cronEnabled,
    keepDaily: config.keepDaily,
    keepMonthly: config.keepMonthly,
    running,
  }),
);
app.post("/backup", async (_req, res) => {
  if (running) return res.status(409).json({ error: "already running" });
  runBackupCycle();
  res.json({ status: "started" });
});

if (config.cronEnabled) {
  if (!cron.validate(config.cron)) {
    console.error(`[pds-backup] invalid cron: ${config.cron}`);
  } else {
    cron.schedule(config.cron, runBackupCycle);
    console.log(`[pds-backup] cron: ${config.cron}`);
  }
} else {
  console.log("[pds-backup] cron disabled via env");
}

app.listen(config.port, () => {
  console.log(`[pds-backup] listening on http://localhost:${config.port}`);
  console.log(`[pds-backup] backupDir: ${config.backupDir}`);
});
