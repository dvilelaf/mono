/**
 * Thin Python-subprocess wrapper around `scripts/eval.py` from the upstream
 * SWE-rebench/SWE-rebench-V2 repo (MIT). Operators install the upstream
 * harness as a Python dependency; this runner shells out and parses the
 * structured JSON report.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { EvalRunner } from './index.js';

/**
 * Thrown when the eval could not actually grade the solution — Docker
 * unavailable, image pull/IO failure, the model patch failed to apply, the
 * install/test-setup step failed, an arch-incompatible image crashed, the
 * upstream harness errored, etc. The caller MUST NOT turn this into a
 * `passed_match: false` verdict: there is no signal about the solver, only
 * about the operator's environment. The evaluator harness re-raises it as a
 * `SkippableError` so the engine records a skip (no delivered verdict).
 */
export class EvalCouldNotGradeError extends Error {
  readonly reason: string;
  /** A short, redacted excerpt of the eval output, for diagnostics. */
  readonly logExcerpt: string;

  constructor(reason: string, logExcerpt = '') {
    super(`swe-rebench-v2 eval could not grade the solution (${reason})`);
    this.name = 'EvalCouldNotGradeError';
    this.reason = reason;
    this.logExcerpt = logExcerpt.slice(0, 1000);
  }
}

export interface PythonEvalRunnerOptions {
  /** Path to the cloned SWE-rebench-V2 repo (cached locally). */
  upstreamRepoDir: string;
  /** Override Python executable. Defaults to `python3`. */
  pythonBin?: string;
  /** Workers for parallel eval (defaults to 1; we run one task at a time). */
  maxWorkers?: number;
}

/**
 * Known infra-abort signatures in the container output. Used only to produce
 * a human-readable `reason`; the load-bearing classifier is
 * "container exited non-zero AND no test was collected" (see below).
 */
const INFRA_SIGNATURES: Array<{ rx: RegExp; reason: string }> = [
  { rx: /Cannot connect to the Docker daemon/i, reason: 'docker_unavailable' },
  { rx: /input\/output error/i, reason: 'docker_storage_io_error' },
  { rx: /error: corrupt patch at line/i, reason: 'patch_corrupt' },
  { rx: /patch does not apply|patch failed:/i, reason: 'patch_does_not_apply' },
  { rx: /Applied patch to .+ with conflicts|^U \S/m, reason: 'patch_merge_conflict' },
  { rx: /: command not found/i, reason: 'test_command_not_found' },
  { rx: /Failed building editable|Failed to build installable wheels/i, reason: 'install_build_failed' },
  { rx: /No virtual environment found/i, reason: 'venv_missing' },
  { rx: /exec format error|requested image's platform .* does not match/i, reason: 'image_arch_mismatch' },
];

function classifyInfraReason(log: string): string {
  for (const { rx, reason } of INFRA_SIGNATURES) {
    if (rx.test(log)) return reason;
  }
  return 'eval_aborted_before_tests';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export class PythonEvalRunner implements EvalRunner {
  constructor(private readonly opts: PythonEvalRunnerOptions) {}

  async runEval(args: Parameters<EvalRunner['runEval']>[0]): ReturnType<EvalRunner['runEval']> {
    const tmp = await mkdtemp(join(tmpdir(), 'swerebench-eval-'));
    // Single-task runner: eval.py matches the patch override by instance_id.
    const INSTANCE_ID = args.instance_id;
    const taskJson = [{
      instance_id: INSTANCE_ID,
      // SWE-rebench Docker images place the checked-out repository at
      // /testbed. The upstream eval.py derives its docker workdir from the
      // repo slug, so use a synthetic slug that resolves to /testbed while
      // preserving the real repo separately in the Jinn task/HF row.
      repo: 'jinn/testbed',
      image_name: args.image,
      FAIL_TO_PASS: args.fail_to_pass,
      PASS_TO_PASS: args.pass_to_pass,
      test_patch: args.test_patch,
      install_config: {
        test_cmd: [
          ...normalizeCommands(args.install),
          ...normalizeCommands(args.test_cmd),
        ],
        log_parser: args.log_parser,
      },
    }];
    // Upstream eval.py expects --patches to be a JSON list of
    // `{instance_id, patch, test_patch?}` overrides keyed by instance_id.
    const patchesJson = [{ instance_id: INSTANCE_ID, patch: args.patch }];
    const taskJsonPath = join(tmp, 'task.json');
    const patchesJsonPath = join(tmp, 'patches.json');
    const reportPath = join(tmp, 'report.json');
    await writeFile(taskJsonPath, JSON.stringify(taskJson));
    await writeFile(patchesJsonPath, JSON.stringify(patchesJson));

    const pyArgs = [
      '-m', 'scripts.eval',
      '--json', taskJsonPath,
      '--patches', patchesJsonPath,
      '--max-workers', String(this.opts.maxWorkers ?? 1),
      '--report-json', reportPath,
    ];
    const child = spawn(this.opts.pythonBin ?? 'python3', pyArgs, {
      cwd: this.opts.upstreamRepoDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      // SWE-rebench eval images are published for linux/amd64. Pin the platform
      // so the upstream `docker run` is consistent on amd64 hosts and does not
      // silently crash under arm64 emulation on dev machines.
      env: { ...process.env, DOCKER_DEFAULT_PLATFORM: 'linux/amd64' },
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('close', (code) => resolve(code ?? 1));
      child.on('error', reject);
    });

    let report: { items?: Array<Record<string, unknown>> };
    try {
      report = JSON.parse(await readFile(reportPath, 'utf8')) as typeof report;
    } catch {
      await rm(tmp, { recursive: true, force: true });
      // The upstream harness never produced a report — it crashed before it
      // could grade anything. Not a verdict about the solver.
      throw new EvalCouldNotGradeError(
        classifyInfraReason(stderr + stdout),
        `python exitCode=${exitCode}; ${(stderr || stdout).slice(-800)}`,
      );
    }

    // Upstream report item shape: { instance_id, exit_code (the docker-run
    // exit code), passed_match, passed_expected, passed_actual, failed_actual,
    // log_path, ... }.
    const items = Array.isArray(report.items) ? report.items : [];
    const item = items.find((i) => i['instance_id'] === INSTANCE_ID) ?? items[0] ?? {};

    const containerExit = typeof item['exit_code'] === 'number' ? (item['exit_code'] as number) : exitCode;
    const passedActual = asStringArray(item['passed_actual']);
    const failedActual = asStringArray(item['failed_actual']);

    // The upstream eval.py writes the full container log to
    // <upstreamRepoDir>/logs/<instance>_log.txt and records `log_path` in the
    // report — sometimes relative to its own cwd (the upstream repo dir).
    // Resolve it so the test-log artifact carries the real pytest/container
    // output rather than just the progress bar.
    let logBody = '';
    const logPath = item['log_path'];
    if (typeof logPath === 'string' && logPath.length > 0) {
      const resolved = isAbsolute(logPath) ? logPath : join(this.opts.upstreamRepoDir, logPath);
      try {
        logBody = await readFile(resolved, 'utf8');
      } catch {
        logBody = '';
      }
    }
    const fullLog = stdout + logBody;

    await rm(tmp, { recursive: true, force: true });

    // The eval did not actually grade the solution if the container aborted
    // (non-zero exit) before any expected test was collected. A genuine
    // wrong-answer run still surfaces the FAIL_TO_PASS / PASS_TO_PASS tests in
    // passed_actual / failed_actual, so this only catches infra aborts: Docker
    // down, patch-apply failure, test-file merge conflict, install/setup
    // failure, missing test command, arch-incompatible image, etc.
    if (containerExit !== 0 && passedActual.length === 0 && failedActual.length === 0) {
      throw new EvalCouldNotGradeError(
        classifyInfraReason(fullLog || stderr),
        (fullLog || stderr).slice(-800),
      );
    }

    return {
      passed_match: item['passed_match'] === true,
      passed: passedActual,
      failed: failedActual,
      log: fullLog,
      exitCode: containerExit,
    };
  }
}

function normalizeCommands(value: string | string[] | undefined): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
