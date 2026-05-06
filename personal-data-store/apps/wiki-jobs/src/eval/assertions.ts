import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Fixture } from "./fixtures.js";

export type Severity = "info" | "warning" | "critical";

export interface AssertionFailure {
  fixture: string;
  check: string;
  subject: string;
  severity: Severity;
  message: string;
  fingerprint: string;
}

export interface AssertionResult {
  fixture: string;
  passed: number;
  failed: AssertionFailure[];
}

interface Ctx {
  wikiDir: string;
  goalsDir: string;
  blockersDir: string;
  synthDir: string;
}

function ctxFor(wikiDir: string): Ctx {
  return {
    wikiDir,
    synthDir: path.join(wikiDir, "20-synthesis"),
    goalsDir: path.join(wikiDir, "20-synthesis", "goals"),
    blockersDir: path.join(wikiDir, "20-synthesis", "blockers"),
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function countWords(s: string): number {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`\[\]\(\)\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function fingerprint(parts: string[]): string {
  return `wiki_eval:${parts.join(":").replace(/[^A-Za-z0-9._:-]+/g, "_")}`;
}

// Extracts links of the shape [text](path.md) — returns the path string only.
function mdLinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
}

// Locate the section under "## Top blockers" / similar header. Tolerant of
// the exact wording so prose drift doesn't cause false negatives — we just
// need *some* header that signals a blocker list.
function topBlockersBlock(body: string): string | null {
  const lines = body.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+top\s+blockers/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

async function checkGoalPages(
  fx: Fixture,
  ctx: Ctx,
  failures: AssertionFailure[],
): Promise<number> {
  let passed = 0;
  const exp = fx.expectations;

  for (const goalFile of exp.goalPages) {
    const goalPath = path.join(ctx.goalsDir, goalFile);
    if (!(await exists(goalPath))) {
      failures.push({
        fixture: fx.name,
        check: "goal-page-missing",
        subject: goalFile,
        severity: "critical",
        message: `expected goal page ${goalFile} not found in 20-synthesis/goals/`,
        fingerprint: fingerprint([fx.name, "goal-page-missing", goalFile]),
      });
      continue;
    }
    const body = await readFile(goalPath, "utf8");
    const block = topBlockersBlock(body);

    if (exp.requireTopBlockersSection && !block) {
      failures.push({
        fixture: fx.name,
        check: "top-blockers-section-missing",
        subject: goalFile,
        severity: "warning",
        message: `${goalFile} has no "Top blockers" section header`,
        fingerprint: fingerprint([fx.name, "top-blockers-section-missing", goalFile]),
      });
      continue;
    }

    const links = block ? mdLinks(block).filter((l) => l.includes("blockers/")) : [];
    if (links.length < exp.minBlockersPerGoal) {
      failures.push({
        fixture: fx.name,
        check: "blocker-count-below-minimum",
        subject: goalFile,
        severity: "warning",
        message: `${goalFile} lists ${links.length} blockers, expected ≥ ${exp.minBlockersPerGoal}`,
        fingerprint: fingerprint([fx.name, "blocker-count", goalFile]),
      });
      continue;
    }

    if (exp.requireBlockerLinksResolve) {
      let unresolved = 0;
      for (const link of links) {
        const target = path.resolve(path.dirname(goalPath), link);
        if (!(await exists(target))) {
          unresolved++;
          failures.push({
            fixture: fx.name,
            check: "blocker-link-unresolved",
            subject: `${goalFile} → ${link}`,
            severity: "critical",
            message: `${goalFile} links to ${link} which does not exist`,
            fingerprint: fingerprint([fx.name, "blocker-link-unresolved", goalFile, link]),
          });
        }
      }
      if (unresolved > 0) continue;
    }

    passed++;
  }
  return passed;
}

async function checkReadMe(
  fx: Fixture,
  ctx: Ctx,
  failures: AssertionFailure[],
): Promise<number> {
  const exp = fx.expectations.readMe;
  if (!exp?.required) return 0;

  let entries: string[] = [];
  try {
    entries = await readdir(ctx.synthDir);
  } catch {
    failures.push({
      fixture: fx.name,
      check: "synth-dir-missing",
      subject: "20-synthesis",
      severity: "critical",
      message: `${ctx.synthDir} does not exist`,
      fingerprint: fingerprint([fx.name, "synth-dir-missing"]),
    });
    return 0;
  }

  const readMes = entries
    .filter((e) => /^\d{4}-\d{2}-\d{2}-read-me\.md$/.test(e))
    .sort()
    .reverse();

  if (readMes.length === 0) {
    failures.push({
      fixture: fx.name,
      check: "read-me-missing",
      subject: "20-synthesis",
      severity: "critical",
      message: `no YYYY-MM-DD-read-me.md found in 20-synthesis/`,
      fingerprint: fingerprint([fx.name, "read-me-missing"]),
    });
    return 0;
  }

  const latest = readMes[0];
  const datePart = latest.slice(0, 10);
  const ageDays = Math.floor(
    (Date.now() - new Date(datePart + "T00:00:00Z").getTime()) / 86400000,
  );
  if (ageDays > exp.maxAgeDays) {
    failures.push({
      fixture: fx.name,
      check: "read-me-stale",
      subject: latest,
      severity: "warning",
      message: `latest read-me ${latest} is ${ageDays}d old, max ${exp.maxAgeDays}d`,
      fingerprint: fingerprint([fx.name, "read-me-stale"]),
    });
  }

  const body = await readFile(path.join(ctx.synthDir, latest), "utf8");
  const words = countWords(body);
  if (words > exp.maxWords) {
    failures.push({
      fixture: fx.name,
      check: "read-me-too-long",
      subject: latest,
      severity: "warning",
      message: `${latest} has ${words} words, max ${exp.maxWords}`,
      fingerprint: fingerprint([fx.name, "read-me-too-long", latest]),
    });
  }

  for (const pat of exp.requiredSectionPatterns ?? []) {
    if (!new RegExp(pat, "i").test(body)) {
      failures.push({
        fixture: fx.name,
        check: "read-me-missing-section",
        subject: latest,
        severity: "warning",
        message: `${latest} is missing required section pattern /${pat}/i`,
        fingerprint: fingerprint([fx.name, "read-me-missing-section", pat]),
      });
    }
  }

  return failures.length === 0 ? 1 : 0;
}

async function checkBlockerPages(
  fx: Fixture,
  ctx: Ctx,
  failures: AssertionFailure[],
): Promise<number> {
  const exp = fx.expectations.blockerPage;
  if (!exp) return 0;
  let passed = 0;

  let entries: string[] = [];
  try {
    entries = await readdir(ctx.blockersDir);
  } catch {
    return 0;
  }

  for (const file of entries) {
    if (!file.endsWith(".md")) continue;
    const body = await readFile(path.join(ctx.blockersDir, file), "utf8");

    if (exp.requireBlocksGoalLink) {
      const block = body.match(/##\s+blocks\s+goal[\s\S]{0,400}/i)?.[0];
      const link = block ? mdLinks(block).find((l) => l.includes("goals/")) : undefined;
      if (!link) {
        failures.push({
          fixture: fx.name,
          check: "blocker-missing-goal-link",
          subject: file,
          severity: "warning",
          message: `${file} has no link to a goal page under ## Blocks goal`,
          fingerprint: fingerprint([fx.name, "blocker-missing-goal-link", file]),
        });
        continue;
      }
    }

    if (exp.requireSmallestNextAction) {
      if (!/##\s+smallest\s+next\s+action/i.test(body)) {
        failures.push({
          fixture: fx.name,
          check: "blocker-missing-next-action",
          subject: file,
          severity: "info",
          message: `${file} has no "## Smallest next action" section`,
          fingerprint: fingerprint([fx.name, "blocker-missing-next-action", file]),
        });
        continue;
      }
    }
    passed++;
  }

  return passed;
}

export async function runAssertions(
  fixtures: Fixture[],
  wikiDir: string,
): Promise<AssertionResult[]> {
  const ctx = ctxFor(wikiDir);
  const out: AssertionResult[] = [];
  for (const fx of fixtures) {
    if (fx.job !== "synthesise") continue;
    const failures: AssertionFailure[] = [];
    const goalsPassed = await checkGoalPages(fx, ctx, failures);
    const readMePassed = await checkReadMe(fx, ctx, failures);
    const blockersPassed = await checkBlockerPages(fx, ctx, failures);
    out.push({
      fixture: fx.name,
      passed: goalsPassed + readMePassed + blockersPassed,
      failed: failures,
    });
  }
  return out;
}
