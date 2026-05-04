import "dotenv/config";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const monoRepo = process.env.GROWTH_MONO_REPO ?? "/Users/gcd/Repositories/main/mono";

export const config = {
  port: parseInt(process.env.GROWTH_JOBS_PORT ?? "3101", 10),
  repoRoot,
  monoRepo,
  pdsApiUrl: process.env.PDS_API_URL ?? "http://localhost:3000",
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  logDir: path.join(repoRoot, "logs", "growth-jobs"),
  schedules: {
    "growth-day": process.env.GROWTH_DAY_CRON ?? "0 9 * * 1-5",
  },
  canonicalTopics: {
    "growth-day": (process.env.GROWTH_DAY_CANONICAL_TOPICS ?? "growth.daily,growth.thesis,growth.outreach")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  enabled: (process.env.GROWTH_JOBS_CRON_ENABLED ?? "true") === "true",
  timeoutMs: parseInt(process.env.GROWTH_JOB_TIMEOUT_MS ?? String(20 * 60 * 1000), 10),
} as const;

export type JobName = "growth-day";
