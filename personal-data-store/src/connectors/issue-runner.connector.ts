import { spawn } from "node:child_process";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { Connector, SyncResult } from "./connector.interface.js";
import { createDocument } from "../domains/documents/documents.service.js";
import { createMessage } from "../domains/messages/messages.service.js";

type Issue = {
  number: number;
  title: string;
  labels: { name: string }[];
};

type IssueResult = {
  number: number;
  title: string;
  exitCode: number | null;
  ok: boolean;
  closed: boolean;
  startedAt: string;
  finishedAt: string;
  skipped?: "time-guard" | "max-issues";
  error?: string;
};

const PRIORITY_ORDER = ["priority-high", "priority-medium", "priority-low"];

function priorityRank(issue: Issue): number {
  const names = issue.labels.map((l) => l.name);
  for (let i = 0; i < PRIORITY_ORDER.length; i++) {
    if (names.includes(PRIORITY_ORDER[i])) return i;
  }
  return PRIORITY_ORDER.length;
}

function settings() {
  return {
    repoRoot: process.env.ISSUE_RUNNER_REPO_ROOT ?? process.cwd(),
    repoSlug: process.env.ISSUE_RUNNER_REPO ?? "oaksprout/personal-data-store",
    claudeBin: process.env.CLAUDE_PATH ?? process.env.CLAUDE_BIN ?? "claude",
    ghBin: process.env.GH_BIN ?? "gh",
    perIssueTimeoutMs: parseInt(
      process.env.ISSUE_RUNNER_TIMEOUT_MS ?? String(60 * 60 * 1000),
      10,
    ),
    stopAfterHour: parseInt(process.env.ISSUE_RUNNER_STOP_HOUR ?? "5", 10),
    maxIssuesPerRun: parseInt(process.env.ISSUE_RUNNER_MAX_ISSUES ?? "0", 10),
    logDir: process.env.ISSUE_RUNNER_LOG_DIR
      ?? path.join(process.env.ISSUE_RUNNER_REPO_ROOT ?? process.cwd(), "logs", "issue-runner"),
  };
}

function washEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
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
    delete env[key];
  }
  return env;
}

function execCmd(
  bin: string,
  args: string[],
  opts: { cwd: string; input?: string } = { cwd: process.cwd() },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    if (opts.input) child.stdin.write(opts.input);
    child.stdin.end();
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: null, stdout, stderr: stderr + err.message }));
  });
}

async function listOpenIssues(repoSlug: string, repoRoot: string, ghBin: string): Promise<Issue[]> {
  const { code, stdout, stderr } = await execCmd(
    ghBin,
    ["issue", "list", "--repo", repoSlug, "--state", "open", "--limit", "200", "--json", "number,title,labels"],
    { cwd: repoRoot },
  );
  if (code !== 0) throw new Error(`gh issue list failed (exit ${code}): ${stderr.trim()}`);
  return JSON.parse(stdout) as Issue[];
}

async function readIssueBody(num: number, repoSlug: string, repoRoot: string, ghBin: string): Promise<string> {
  const { code, stdout, stderr } = await execCmd(
    ghBin,
    ["issue", "view", String(num), "--repo", repoSlug],
    { cwd: repoRoot },
  );
  if (code !== 0) throw new Error(`gh issue view ${num} failed (exit ${code}): ${stderr.trim()}`);
  return stdout;
}

async function closeIssue(
  num: number,
  comment: string,
  repoSlug: string,
  repoRoot: string,
  ghBin: string,
): Promise<{ ok: boolean; error?: string }> {
  const { code, stderr } = await execCmd(
    ghBin,
    ["issue", "close", String(num), "--repo", repoSlug, "--comment", comment],
    { cwd: repoRoot },
  );
  if (code !== 0) return { ok: false, error: stderr.trim() };
  return { ok: true };
}

function buildPreamble(issue: Issue, issueView: string, repoRoot: string, repoSlug: string, today: string): string {
  return [
    `You are the OVERNIGHT ISSUE RUNNER for the Personal Data Store (PDS) repository.`,
    `Today's date is ${today}.`,
    `Working directory (PDS repo root): ${repoRoot}`,
    `GitHub repo: ${repoSlug}`,
    `Issue: #${issue.number} — ${issue.title}`,
    "",
    "=== HARD CONSTRAINTS — DO NOT VIOLATE ===",
    "1. NEVER run DROP, TRUNCATE, or DELETE without WHERE on any table. Destructive SQL without scope is forbidden.",
    "2. Use British English in all user-facing text, comments, commit messages and PR copy.",
    "3. When the implementation is complete and verified, merge the working branch to `main`. Do not leave half-finished work on a side branch.",
    "4. After merging, rebuild the affected app(s) (npm run build / tsc as appropriate) and reload the relevant PM2 service(s).",
    "5. Verify the deployment over Tailscale (the macbook-pro.tail0b19d9.ts.net hostname) — NOT localhost — before declaring success.",
    "6. Do NOT skip git hooks (no --no-verify). Do not bypass signing. Investigate failures and fix the root cause.",
    "7. If the task can't be completed safely, exit non-zero and leave a comment on the issue explaining why. Do not force a partial merge.",
    "",
    "=== TASK ===",
    `Implement the work described in issue #${issue.number} (full body below). When done, the runner will close the issue automatically if you exit 0.`,
    "",
    "--- ISSUE BODY (gh issue view) ---",
    issueView,
    "--- END ISSUE BODY ---",
    "",
    "Begin now.",
  ].join("\n");
}

async function runOneIssue(
  issue: Issue,
  logPath: string,
  s: ReturnType<typeof settings>,
): Promise<IssueResult> {
  const startedAt = new Date();
  const today = startedAt.toISOString().slice(0, 10);
  await appendFile(logPath, `\n\n===== issue #${issue.number} start ${startedAt.toISOString()} — ${issue.title} =====\n`);

  let issueView: string;
  try {
    issueView = await readIssueBody(issue.number, s.repoSlug, s.repoRoot, s.ghBin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendFile(logPath, `[gh view error] ${msg}\n`);
    return {
      number: issue.number,
      title: issue.title,
      exitCode: null,
      ok: false,
      closed: false,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      error: msg,
    };
  }

  const preamble = buildPreamble(issue, issueView, s.repoRoot, s.repoSlug, today);
  const childEnv = washEnv();

  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(
      s.claudeBin,
      ["-p", "--permission-mode", "bypassPermissions"],
      { cwd: s.repoRoot, env: childEnv, stdio: ["pipe", "pipe", "pipe"] },
    );
    const timeout = setTimeout(() => child.kill("SIGTERM"), s.perIssueTimeoutMs);

    child.stdout.on("data", (chunk) => appendFile(logPath, chunk).catch(() => {}));
    child.stderr.on("data", (chunk) => appendFile(logPath, chunk).catch(() => {}));

    child.stdin.write(preamble);
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

  const ok = exitCode === 0;
  let closed = false;
  let closeError: string | undefined;
  if (ok) {
    const r = await closeIssue(issue.number, "Implemented and merged to main.", s.repoSlug, s.repoRoot, s.ghBin);
    closed = r.ok;
    closeError = r.error;
    await appendFile(logPath, `\n[gh issue close] ok=${r.ok}${r.error ? ` err=${r.error}` : ""}\n`);
  }

  const finishedAt = new Date();
  await appendFile(logPath, `===== issue #${issue.number} end ${finishedAt.toISOString()} exit=${exitCode} closed=${closed} =====\n`);

  return {
    number: issue.number,
    title: issue.title,
    exitCode,
    ok,
    closed,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    error: closeError,
  };
}

function pastStopTime(now: Date, stopAfterHour: number): boolean {
  const h = now.getHours();
  return h >= stopAfterHour && h < 12;
}

export const issueRunnerConnector: Connector = {
  name: "issue_runner",
  schedule: process.env.ISSUE_RUNNER_SCHEDULE ?? "0 23 * * *",
  async sync(): Promise<SyncResult> {
    const s = settings();
    const errors: string[] = [];
    const startedAt = new Date();
    await mkdir(s.logDir, { recursive: true });
    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const logPath = path.join(s.logDir, `run-${stamp}.log`);
    await appendFile(logPath, `=== issue-runner start ${startedAt.toISOString()} ===\n`);

    const results: IssueResult[] = [];
    let issues: Issue[] = [];
    try {
      issues = await listOpenIssues(s.repoSlug, s.repoRoot, s.ghBin);
      issues.sort((a, b) => priorityRank(a) - priorityRank(b) || a.number - b.number);
      await appendFile(logPath, `Found ${issues.length} open issues.\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      await appendFile(logPath, `[fatal] ${msg}\n`);
    }

    let processed = 0;
    for (const issue of issues) {
      const now = new Date();
      if (pastStopTime(now, s.stopAfterHour)) {
        await appendFile(logPath, `\n[time-guard] now=${now.toISOString()} hour=${now.getHours()} past stop hour ${s.stopAfterHour} — skipping remainder.\n`);
        results.push({
          number: issue.number,
          title: issue.title,
          exitCode: null,
          ok: false,
          closed: false,
          startedAt: now.toISOString(),
          finishedAt: now.toISOString(),
          skipped: "time-guard",
        });
        continue;
      }
      if (s.maxIssuesPerRun > 0 && processed >= s.maxIssuesPerRun) {
        results.push({
          number: issue.number,
          title: issue.title,
          exitCode: null,
          ok: false,
          closed: false,
          startedAt: now.toISOString(),
          finishedAt: now.toISOString(),
          skipped: "max-issues",
        });
        continue;
      }
      try {
        const r = await runOneIssue(issue, logPath, s);
        results.push(r);
        if (!r.ok) errors.push(`#${r.number}: exit=${r.exitCode}${r.error ? ` ${r.error}` : ""}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`#${issue.number}: ${msg}`);
        await appendFile(logPath, `[error] #${issue.number}: ${msg}\n`);
      }
      processed++;
    }

    const finishedAt = new Date();
    await appendFile(logPath, `\n=== issue-runner end ${finishedAt.toISOString()} ===\n`);

    let logTail = "";
    try {
      const text = await readFile(logPath, "utf8");
      logTail = text.length > 16000 ? "…" + text.slice(text.length - 16000) : text;
    } catch {
      /* ignore */
    }

    const closed = results.filter((r) => r.ok && r.closed);
    const failed = results.filter((r) => !r.ok && !r.skipped);
    const skipped = results.filter((r) => r.skipped);

    const stampDay = startedAt.toISOString().slice(0, 10);
    const content = [
      `# Issue Runner Run — ${stampDay}`,
      "",
      `- Started: ${startedAt.toISOString()}`,
      `- Finished: ${finishedAt.toISOString()}`,
      `- Log path: ${logPath}`,
      `- Repo: ${s.repoSlug}`,
      "",
      "## Results",
      "",
      "| # | Title | exit | closed | skipped |",
      "|---|---|---|---|---|",
      ...results.map(
        (r) =>
          `| ${r.number} | ${r.title.replace(/\|/g, "\\|")} | ${r.exitCode ?? ""} | ${r.closed ? "yes" : "no"} | ${r.skipped ?? ""} |`,
      ),
      "",
      "## Log tail",
      "",
      "```",
      logTail,
      "```",
    ].join("\n");

    let documentId: string | undefined;
    try {
      const doc = await createDocument({
        domain: "ops",
        type: "issue-runner-log",
        title: `Issue Runner Log — ${stampDay}`,
        content,
        source: "issue-runner",
        metadata: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          results,
          logPath,
          repo: s.repoSlug,
        },
      });
      documentId = doc.id;
    } catch (err) {
      errors.push(`document insert failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const subject = `Issue Runner — ${closed.length} closed, ${failed.length} failed, ${skipped.length} skipped`;
      const bodyLines: string[] = [
        `Started: ${startedAt.toISOString()}`,
        `Finished: ${finishedAt.toISOString()}`,
        `Log: ${logPath}`,
        "",
      ];
      if (closed.length) {
        bodyLines.push("Closed:");
        for (const r of closed) bodyLines.push(`  #${r.number} ${r.title}`);
        bodyLines.push("");
      }
      if (failed.length) {
        bodyLines.push("Failed:");
        for (const r of failed) bodyLines.push(`  #${r.number} ${r.title} — exit=${r.exitCode}${r.error ? ` ${r.error}` : ""}`);
        bodyLines.push("");
      }
      if (skipped.length) {
        bodyLines.push("Skipped:");
        for (const r of skipped) bodyLines.push(`  #${r.number} ${r.title} — ${r.skipped}`);
      }
      const summary = closed.length
        ? `Closed ${closed.length} issue${closed.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} failed` : ""}.`
        : failed.length
          ? `${failed.length} issue${failed.length === 1 ? "" : "s"} failed overnight.`
          : `No issues processed (${skipped.length} skipped).`;
      await createMessage({
        type: "issue-runner",
        subject,
        body: bodyLines.join("\n"),
        metadata: {
          succeeded: closed.length,
          failed: failed.length,
          skipped: skipped.length,
          logPath,
          documentId,
          summary,
        },
      });
    } catch (err) {
      errors.push(`message insert failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      recordsSynced: closed.length,
      errors: errors.length ? errors : undefined,
    };
  },
};
