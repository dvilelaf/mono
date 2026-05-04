import { spawn } from "node:child_process";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, type JobName } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");

const JOB_PROMPTS: Record<JobName, string> = {
  "growth-day": "scripts/growth-day.md",
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

  const promptPath = path.join(APP_ROOT, JOB_PROMPTS[job]);
  const promptBody = await readFile(promptPath, "utf8");
  const today = startedAt.toISOString().slice(0, 10);

  const systemPreamble = [
    `You are the ${job.toUpperCase()} job for Jinn growth orchestration.`,
    `Today's date is ${today}.`,
    `Mono repo (working dir): ${config.monoRepo}`,
    `PDS API base URL: ${config.pdsApiUrl}`,
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

  const childEnv = { ...process.env };
  for (const key of [
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDECODE",
    "CLAUDE_AGENT_SDK_VERSION",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
  ]) {
    delete childEnv[key];
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(
      config.claudeBin,
      ["-p", "--permission-mode", "bypassPermissions"],
      {
        cwd: config.monoRepo,
        env: childEnv,
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

  const ok = exitCode === 0;
  await postCompletionMessage({ job, today, finishedAt, exitCode, logPath, ok }).catch((err) =>
    console.error(`[growth-jobs] message post failed:`, err),
  );

  return {
    job,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    exitCode,
    logPath,
    ok,
  };
}

async function tailLog(logPath: string, maxChars: number): Promise<string> {
  try {
    const text = await readFile(logPath, "utf8");
    if (text.length <= maxChars) return text;
    return "…" + text.slice(text.length - maxChars);
  } catch {
    return "";
  }
}

async function postCompletionMessage(args: {
  job: JobName;
  today: string;
  finishedAt: Date;
  exitCode: number | null;
  logPath: string;
  ok: boolean;
}): Promise<void> {
  const niceJob = args.job
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  const status = args.ok ? "Complete" : `Failed (exit=${args.exitCode ?? "null"})`;
  const subject = `${niceJob} ${status} — ${args.today}`;
  const tail = await tailLog(args.logPath, 4000);
  const body = [
    `Job: ${args.job}`,
    `Status: ${status}`,
    `Finished: ${args.finishedAt.toISOString()}`,
    `Log: ${args.logPath}`,
    "",
    "--- log tail ---",
    tail,
  ].join("\n");

  const summary = args.ok
    ? `${niceJob} finished cleanly at ${args.finishedAt.toISOString()}. See log tail for details.`
    : `${niceJob} failed (exit=${args.exitCode ?? "null"}) at ${args.finishedAt.toISOString()}. Check ${args.logPath}`;

  try {
    const res = await fetch(`${config.pdsApiUrl}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PDS_API_KEY ? { Authorization: `Bearer ${process.env.PDS_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        type: "growth",
        subject,
        body,
        metadata: {
          job: args.job,
          exitCode: args.exitCode,
          ok: args.ok,
          logPath: args.logPath,
          summary,
        },
      }),
    });
    if (!res.ok) {
      console.error(`[growth-jobs] message POST ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[growth-jobs] message POST threw:", err);
  }
}
