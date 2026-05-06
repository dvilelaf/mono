import "dotenv/config";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");

export const config = {
  port: parseInt(process.env.WIKI_JOBS_PORT ?? "3100", 10),
  repoRoot,
  wikiDir: path.join(repoRoot, "wiki"),
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  logDir: path.join(repoRoot, "logs", "wiki-jobs"),
  schedules: {
    extract: process.env.WIKI_EXTRACT_CRON ?? "0 6 * * *",
    analyse: process.env.WIKI_ANALYSE_CRON ?? "0 7 * * *",
    synthesise: process.env.WIKI_SYNTHESISE_CRON ?? "0 8 * * 2,4",
    eval: process.env.WIKI_EVAL_CRON ?? "0 9 * * 0",
  },
  evalEnabled: (process.env.WIKI_EVAL_ENABLED ?? "true") === "true",
  pdsApiUrl: process.env.PDS_API_URL ?? "http://localhost:3000",
  canonicalTopics: {
    extract: (process.env.WIKI_EXTRACT_CANONICAL_TOPICS ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean),
    analyse: (process.env.WIKI_ANALYSE_CANONICAL_TOPICS ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean),
    synthesise: (process.env.WIKI_SYNTHESISE_CANONICAL_TOPICS ?? "goals.cardiovascular,goals.body_composition,goals.fertility,goals.sleep,goals.yield,goals.spending,goals.income,goals.data_automation")
      .split(",").map((s) => s.trim()).filter(Boolean),
  },
  enabled: (process.env.WIKI_JOBS_CRON_ENABLED ?? "true") === "true",
  timeoutMs: parseInt(process.env.WIKI_JOB_TIMEOUT_MS ?? String(30 * 60 * 1000), 10),
} as const;

export type JobName = "extract" | "analyse" | "synthesise";
