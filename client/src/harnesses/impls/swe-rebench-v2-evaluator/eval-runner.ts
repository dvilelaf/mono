/**
 * Thin Python-subprocess wrapper around `scripts/eval.py` from the upstream
 * SWE-rebench/SWE-rebench-V2 repo (MIT). Operators install the upstream
 * harness as a Python dependency; this runner shells out and parses the
 * structured JSON report.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalRunner } from './index.js';

export interface PythonEvalRunnerOptions {
  /** Path to the cloned SWE-rebench-V2 repo (cached locally). */
  upstreamRepoDir: string;
  /** Override Python executable. Defaults to `python3`. */
  pythonBin?: string;
  /** Workers for parallel eval (defaults to 1; we run one task at a time). */
  maxWorkers?: number;
}

export class PythonEvalRunner implements EvalRunner {
  constructor(private readonly opts: PythonEvalRunnerOptions) {}

  async runEval(args: Parameters<EvalRunner['runEval']>[0]): ReturnType<EvalRunner['runEval']> {
    const tmp = await mkdtemp(join(tmpdir(), 'swerebench-eval-'));
    const taskJson = [{
      instance_id: 'task',
      image_name: args.image,
      FAIL_TO_PASS: args.fail_to_pass,
      PASS_TO_PASS: args.pass_to_pass,
      test_patch: args.test_patch,
      install_config: { test_cmd: args.test_cmd, log_parser: args.log_parser },
    }];
    const taskJsonPath = join(tmp, 'task.json');
    const patchJsonPath = join(tmp, 'patch.json');
    const reportPath = join(tmp, 'report.json');
    await writeFile(taskJsonPath, JSON.stringify(taskJson));
    await writeFile(patchJsonPath, JSON.stringify({ task: { model_patch: args.patch } }));

    const pyArgs = [
      '-m', 'scripts.eval',
      '--json', taskJsonPath,
      '--patch-json', patchJsonPath,
      '--max-workers', String(this.opts.maxWorkers ?? 1),
      '--report-json', reportPath,
    ];
    const child = spawn(this.opts.pythonBin ?? 'python3', pyArgs, {
      cwd: this.opts.upstreamRepoDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('close', (code) => resolve(code ?? 1));
      child.on('error', reject);
    });

    let report: any;
    try {
      report = JSON.parse(await readFile(reportPath, 'utf8'));
    } catch (err) {
      throw new Error(`Eval runner failed: exitCode=${exitCode}, stderr=${stderr}`);
    }
    await rm(tmp, { recursive: true, force: true });

    const taskReport = report.task ?? report['task'] ?? {};
    return {
      passed_match: taskReport.passed_match === true,
      passed: taskReport.passed_actual ?? [],
      failed: taskReport.failed_actual ?? [],
      log: stdout + (taskReport.log ?? ''),
      exitCode,
    };
  }
}
