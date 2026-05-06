import path from "node:path";
import { config } from "../config.js";
import { loadFixtures } from "./fixtures.js";
import { runAssertions, type AssertionResult } from "./assertions.js";
import { reportFailures, type ReportOutcome } from "./report.js";

export interface EvalRunOptions {
  report?: boolean;
  wikiDir?: string;
  fixturesDir?: string;
}

export interface EvalRunResult {
  startedAt: string;
  finishedAt: string;
  fixtureCount: number;
  totalPassed: number;
  totalFailed: number;
  results: AssertionResult[];
  report?: ReportOutcome;
  ok: boolean;
}

export async function runEval(opts: EvalRunOptions = {}): Promise<EvalRunResult> {
  const startedAt = new Date();
  const wikiDir = opts.wikiDir ?? config.wikiDir;
  const fixturesDir = opts.fixturesDir ?? path.join(wikiDir, "eval-fixtures");

  const fixtures = await loadFixtures(fixturesDir);
  const results = await runAssertions(fixtures, wikiDir);

  const totalPassed = results.reduce((a, r) => a + r.passed, 0);
  const totalFailed = results.reduce((a, r) => a + r.failed.length, 0);

  let report: ReportOutcome | undefined;
  if (opts.report && totalFailed > 0) {
    report = await reportFailures(results, config.pdsApiUrl, process.env.PDS_API_KEY);
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    fixtureCount: fixtures.length,
    totalPassed,
    totalFailed,
    results,
    report,
    ok: totalFailed === 0,
  };
}
