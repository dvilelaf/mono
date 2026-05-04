import { spawn } from "node:child_process";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { config, type JobName } from "./config.js";

const JOB_PROMPTS: Record<JobName, string> = {
  extract: "scripts/extract.md",
  analyse: "scripts/analyse.md",
  synthesise: "scripts/synthesise.md",
};

export type RunResult = {
  job: JobName;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  logPath: string;
  ok: boolean;
};

let running: Partial<Record<JobName, Promise<RunResult>>> = {};

export function isRunning(job: JobName): boolean {
  return job in running && running[job] !== undefined;
}

export async function runJob(job: JobName): Promise<RunResult> {
  if (running[job]) {
    throw new Error(`Job ${job} is already running`);
  }
  const promise = executeJob(job).finally(() => {
    delete running[job];
  });
  running[job] = promise;
  return promise;
}

async function executeJob(job: JobName): Promise<RunResult> {
  const startedAt = new Date();
  await mkdir(config.logDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(config.logDir, `${job}-${stamp}.log`);

  const promptPath = path.join(config.wikiDir, JOB_PROMPTS[job]);
  const promptBody = await readFile(promptPath, "utf8");
  const today = startedAt.toISOString().slice(0, 10);

  const systemPreamble = [
    `You are the ${job.toUpperCase()} job for the personal wiki.`,
    `Today's date is ${today}.`,
    `Repo root: ${config.repoRoot}`,
    `Wiki dir: ${config.wikiDir}`,
    `Goal doc (read-only): ${path.join(config.repoRoot, "docs/goals-h2-2026.md")}`,
    "",
    "Follow the spec below exactly. Do not exceed the stated scope.",
    "",
    "--- SPEC ---",
    promptBody,
  ].join("\n");

  await appendFile(
    logPath,
    `=== ${job} run start ${startedAt.toISOString()} ===\n`,
  );

  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(
      config.claudeBin,
      ["-p", "--permission-mode", "bypassPermissions"],
      {
        cwd: config.repoRoot,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, config.timeoutMs);

    child.stdout.on("data", (chunk) => appendFile(logPath, chunk).catch(() => {}));
    child.stderr.on("data", (chunk) => appendFile(logPath, chunk).catch(() => {}));

    child.stdin.write(systemPreamble);
    child.stdin.end();

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      appendFile(logPath, `\n[spawn error] ${err.message}\n`).catch(() => {});
      resolve(null);
    });
  });

  const finishedAt = new Date();
  await appendFile(
    logPath,
    `\n=== ${job} run end ${finishedAt.toISOString()} exit=${exitCode} ===\n`,
  );

  return {
    job,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    exitCode,
    logPath,
    ok: exitCode === 0,
  };
}
