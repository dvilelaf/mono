import express from "express";
import cron from "node-cron";
import { config, type JobName } from "./config.js";
import { runJob, isRunning } from "./runner.js";
import { runEval } from "./eval/runner.js";

const app = express();
app.use(express.json());

let evalRunning = false;

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/status", (_req, res) => {
  res.json({
    schedules: config.schedules,
    enabled: config.enabled,
    evalEnabled: config.evalEnabled,
    evalRunning,
    running: {
      extract: isRunning("extract"),
      analyse: isRunning("analyse"),
      synthesise: isRunning("synthesise"),
    },
  });
});

app.post("/eval", async (req, res) => {
  if (evalRunning) {
    return res.status(409).json({ error: "eval already running" });
  }
  const report = req.body?.report === true || req.query.report === "true";
  evalRunning = true;
  try {
    const r = await runEval({ report });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  } finally {
    evalRunning = false;
  }
});

app.post("/run/:job", async (req, res) => {
  const job = req.params.job as JobName;
  if (!["extract", "analyse", "synthesise"].includes(job)) {
    return res.status(400).json({ error: "unknown job" });
  }
  if (isRunning(job)) {
    return res.status(409).json({ error: `${job} already running` });
  }
  runJob(job)
    .then((r) => console.log(`[wiki-jobs] ${job} done exit=${r.exitCode} log=${r.logPath}`))
    .catch((err) => console.error(`[wiki-jobs] ${job} failed:`, err));
  res.json({ status: "started", job });
});

function schedule(job: JobName, expr: string) {
  if (!cron.validate(expr)) {
    console.error(`[wiki-jobs] invalid cron for ${job}: ${expr}`);
    return;
  }
  cron.schedule(expr, async () => {
    if (isRunning(job)) {
      console.log(`[wiki-jobs] skip ${job} — already running`);
      return;
    }
    console.log(`[wiki-jobs] cron fire: ${job}`);
    try {
      const r = await runJob(job);
      console.log(`[wiki-jobs] ${job} done exit=${r.exitCode} log=${r.logPath}`);
    } catch (err) {
      console.error(`[wiki-jobs] ${job} failed:`, err);
    }
  });
  console.log(`[wiki-jobs] scheduled ${job}: ${expr}`);
}

if (config.enabled) {
  schedule("extract", config.schedules.extract);
  schedule("analyse", config.schedules.analyse);
  schedule("synthesise", config.schedules.synthesise);
} else {
  console.log("[wiki-jobs] cron disabled via WIKI_JOBS_CRON_ENABLED=false");
}

if (config.evalEnabled && cron.validate(config.schedules.eval)) {
  cron.schedule(config.schedules.eval, async () => {
    if (evalRunning) {
      console.log("[wiki-jobs] skip eval — already running");
      return;
    }
    console.log("[wiki-jobs] cron fire: eval");
    evalRunning = true;
    try {
      const r = await runEval({ report: true });
      console.log(
        `[wiki-jobs] eval done passed=${r.totalPassed} failed=${r.totalFailed} reported=${r.report?.posted ?? 0}`,
      );
    } catch (err) {
      console.error("[wiki-jobs] eval failed:", err);
    } finally {
      evalRunning = false;
    }
  });
  console.log(`[wiki-jobs] scheduled eval: ${config.schedules.eval}`);
}

app.listen(config.port, () => {
  console.log(`[wiki-jobs] listening on http://localhost:${config.port}`);
  console.log(`[wiki-jobs] wiki: ${config.wikiDir}`);
});
