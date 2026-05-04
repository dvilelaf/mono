import express from "express";
import cron from "node-cron";
import { config, type JobName } from "./config.js";
import { runJob, isRunning } from "./runner.js";

const app = express();
app.use(express.json());

const JOBS: JobName[] = ["growth-day"];

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/status", (_req, res) => {
  res.json({
    schedules: config.schedules,
    enabled: config.enabled,
    running: Object.fromEntries(JOBS.map((j) => [j, isRunning(j)])),
  });
});

app.post("/run/:job", async (req, res) => {
  const job = req.params.job as JobName;
  if (!JOBS.includes(job)) {
    return res.status(400).json({ error: "unknown job" });
  }
  if (isRunning(job)) {
    return res.status(409).json({ error: `${job} already running` });
  }
  runJob(job)
    .then((r) => console.log(`[growth-jobs] ${job} done exit=${r.exitCode} log=${r.logPath}`))
    .catch((err) => console.error(`[growth-jobs] ${job} failed:`, err));
  res.json({ status: "started", job });
});

function schedule(job: JobName, expr: string) {
  if (!cron.validate(expr)) {
    console.error(`[growth-jobs] invalid cron for ${job}: ${expr}`);
    return;
  }
  cron.schedule(expr, async () => {
    if (isRunning(job)) {
      console.log(`[growth-jobs] skip ${job} — already running`);
      return;
    }
    console.log(`[growth-jobs] cron fire: ${job}`);
    try {
      const r = await runJob(job);
      console.log(`[growth-jobs] ${job} done exit=${r.exitCode} log=${r.logPath}`);
    } catch (err) {
      console.error(`[growth-jobs] ${job} failed:`, err);
    }
  });
  console.log(`[growth-jobs] scheduled ${job}: ${expr}`);
}

if (config.enabled) {
  for (const job of JOBS) schedule(job, config.schedules[job]);
} else {
  console.log("[growth-jobs] cron disabled via GROWTH_JOBS_CRON_ENABLED=false");
}

app.listen(config.port, () => {
  console.log(`[growth-jobs] listening on http://localhost:${config.port}`);
  console.log(`[growth-jobs] mono: ${config.monoRepo}`);
  console.log(`[growth-jobs] pds:  ${config.pdsApiUrl}`);
});
