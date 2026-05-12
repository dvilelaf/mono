import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PythonEvalRunner,
  EvalCouldNotGradeError,
} from '../../../../src/harnesses/impls/swe-rebench-v2-evaluator/eval-runner.js';

const tempDirs: string[] = [];

/**
 * Build a fake upstream `scripts.eval` repo. By default it writes a report
 * item shaped like the real upstream output for a passing run; pass
 * `reportItem` to override fields (e.g. simulate a Docker-down abort).
 *
 * `logBody` is written to `observed-log.txt` and referenced via the item's
 * `log_path`.
 */
function makeUpstreamFixture(opts: {
  reportItem?: Record<string, unknown>;
  logBody?: string;
} = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'swe-rebench-eval-runner-test-'));
  tempDirs.push(dir);
  const scriptsDir = join(dir, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(join(scriptsDir, '__init__.py'), '');
  const itemOverride = JSON.stringify(opts.reportItem ?? {});
  const logBody = opts.logBody ?? 'ok';
  writeFileSync(join(scriptsDir, 'eval.py'), `
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--json", required=True)
parser.add_argument("--patches", required=True)
parser.add_argument("--max-workers")
parser.add_argument("--report-json", required=True)
args = parser.parse_args()

tasks = json.loads(Path(args.json).read_text())
Path("observed-task.json").write_text(json.dumps(tasks[0]))
Path("observed-patches.json").write_text(Path(args.patches).read_text())
Path("observed-log.txt").write_text(${JSON.stringify(logBody)})

# Real upstream item shape: instance_id, exit_code (the docker-run exit code),
# passed_match, passed_expected, passed_actual, failed_actual, log_path, ...
default_item = {
  "instance_id": tasks[0]["instance_id"],
  "exit_code": 0,
  "passed_match": True,
  "passed_actual": ["test_a"],
  "failed_actual": [],
  "log_path": str(Path("observed-log.txt").resolve()),
}
override = json.loads(${JSON.stringify(itemOverride)})
default_item.update(override)
default_item["instance_id"] = tasks[0]["instance_id"]

Path(args.report_json).write_text(json.dumps({
  "total": 1,
  "passed": 1 if default_item.get("passed_match") else 0,
  "items": [default_item],
}))
`);
  chmodSync(join(scriptsDir, 'eval.py'), 0o755);
  return dir;
}

const REQUEST = {
  instance_id: 'astronomer__astronomer-cosmos-2332',
  repo: 'astronomer/astronomer-cosmos',
  image: 'swerebench/sweb.eval.x86_64.astronomer_1776_astronomer-cosmos-2332:latest',
  patch: 'diff --git a/a b/a\n',
  test_patch: 'diff --git a/t b/t\n',
  install: 'pip install -e .',
  test_cmd: 'pytest tests/dbt/test_graph.py',
  log_parser: 'parse_log_pytest',
  fail_to_pass: ['test_a'],
  pass_to_pass: ['test_b'],
} as const;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('PythonEvalRunner', () => {
  it('passes the real instance id and uses the SWE-rebench /testbed container workdir slug', async () => {
    const upstreamRepoDir = makeUpstreamFixture();
    const runner = new PythonEvalRunner({ upstreamRepoDir, maxWorkers: 1 });

    const result = await runner.runEval(REQUEST);

    const observedTask = JSON.parse(readFileSync(join(upstreamRepoDir, 'observed-task.json'), 'utf8'));
    expect(observedTask.instance_id).toBe('astronomer__astronomer-cosmos-2332');
    expect(observedTask.repo).toBe('jinn/testbed');
    expect(observedTask.install_config.test_cmd).toEqual([
      'pip install -e .',
      'pytest tests/dbt/test_graph.py',
    ]);
    expect(result.passed_match).toBe(true);
    expect(result.passed).toEqual(['test_a']);
  });

  it('returns passed_match=false (a genuine wrong-answer) when the suite ran but the FAIL_TO_PASS test still fails', async () => {
    // The container exited non-zero (pytest reports failures) but tests DID
    // run: PASS_TO_PASS passed, the FAIL_TO_PASS test failed. This must be
    // graded as a real verdict, not misclassified as an infra abort.
    const upstreamRepoDir = makeUpstreamFixture({
      reportItem: {
        exit_code: 1,
        passed_match: false,
        passed_actual: ['test_b'],
        failed_actual: ['test_a'],
      },
      logBody: 'test session starts\ntest_a FAILED\ntest_b PASSED\n1 failed, 1 passed',
    });
    const runner = new PythonEvalRunner({ upstreamRepoDir, maxWorkers: 1 });
    const result = await runner.runEval(REQUEST);
    expect(result.passed_match).toBe(false);
    expect(result.failed).toContain('test_a');
  });

  it('throws EvalCouldNotGradeError when Docker is unreachable (no test collected, container exit non-zero)', async () => {
    const upstreamRepoDir = makeUpstreamFixture({
      reportItem: {
        exit_code: 125,
        passed_match: false,
        passed_actual: [],
        failed_actual: [],
      },
      logBody:
        'docker: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
    });
    const runner = new PythonEvalRunner({ upstreamRepoDir, maxWorkers: 1 });
    const err = await runner.runEval(REQUEST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvalCouldNotGradeError);
    expect((err as EvalCouldNotGradeError).reason).toBe('docker_unavailable');
  });

  it('throws EvalCouldNotGradeError when the patch failed to apply (git apply aborted before tests)', async () => {
    const upstreamRepoDir = makeUpstreamFixture({
      reportItem: {
        exit_code: 1,
        passed_match: false,
        passed_actual: [],
        failed_actual: [],
      },
      logBody:
        'Checking patch src/foo.py...\nerror: corrupt patch at line 30',
    });
    const runner = new PythonEvalRunner({ upstreamRepoDir, maxWorkers: 1 });
    await expect(runner.runEval(REQUEST)).rejects.toThrow(/grade/i);
  });

  it('throws EvalCouldNotGradeError when the report file is missing/unparseable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swe-rebench-eval-runner-test-'));
    tempDirs.push(dir);
    const scriptsDir = join(dir, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, '__init__.py'), '');
    // eval.py that never writes the report.
    writeFileSync(join(scriptsDir, 'eval.py'), 'import sys\nsys.exit(2)\n');
    chmodSync(join(scriptsDir, 'eval.py'), 0o755);
    const runner = new PythonEvalRunner({ upstreamRepoDir: dir, maxWorkers: 1 });
    await expect(runner.runEval(REQUEST)).rejects.toBeInstanceOf(EvalCouldNotGradeError);
  });
});
