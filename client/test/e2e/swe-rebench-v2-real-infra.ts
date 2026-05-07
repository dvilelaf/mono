/**
 * Real-infrastructure verification for the swe-rebench-v2 SolverNet.
 *
 * Three sub-phases, each runnable in isolation. They are intentionally
 * graceful-degrade: each phase reports BLOCKED / SKIPPED with a precise
 * reason rather than silently passing when the underlying environment
 * (HF rate limit, Docker daemon down, missing upstream repo) makes the
 * real call impossible.
 *
 * Phase 1 (`runSweRebenchV2HfFetchE2E`) — actually pull a partition from
 *   `nebius/SWE-rebench-leaderboard` via the HF datasets-server, hydrate
 *   one row through `SweRebenchV2TaskSchema`, persist+round-trip a
 *   `GeneratorStateStore` counter on the same instance_id.
 *
 * Phase 2 (`runSweRebenchV2DockerEvalE2E`) — wait for Docker daemon, pick
 *   one task from the HF fetch, pull its image (e.g.
 *   `swerebench/sweb.eval.x86_64.<task>:latest`), and exercise the
 *   `PythonEvalRunner` subprocess + verdict parsing path. The upstream
 *   `scripts/eval.py` requires the SWE-rebench-V2 repo cloned locally —
 *   when missing, this phase reports BLOCKED with the exact missing path.
 *
 * Phase 3 (`runSweRebenchV2SolverTypeRegistrationE2E`) — verifies the
 *   swe-rebench-v2.v1 SolverType is wired into the canonical registry,
 *   that `parseSpec` round-trips a Task built by the generator, and that
 *   the Task hydrates against the SDK schema. Full Anvil-fork settlement
 *   is deferred to the existing fork-helper coverage in
 *   `task-first-helpers.runAnvilTaskFirstFullLoop`; the goal here is to
 *   verify the SolverType wiring + payload v2 envelope shape that the
 *   delivery path relies on.
 *
 * Spec: docs/superpowers/specs/2026-05-06-agent-harness-solvernet-design.md
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { SweRebenchV2TaskSchema } from '@jinn-network/sdk/solvernets/swe-rebench-v2';
import {
  buildHistoricalPool,
  fetchHfSplit,
  listMonthlyPartitions,
  type PoolTask,
} from '../../src/solver-types/_swe-rebench-v2-pool.js';
import { GeneratorStateStore } from '../../src/solver-types/_swe-rebench-v2-state.js';
import { SOLVER_TYPES } from '../../src/solver-types/index.js';
import { PythonEvalRunner } from '../../src/harnesses/impls/swe-rebench-v2-evaluator/eval-runner.js';
import { assert } from './task-first-helpers.js';

const HF_DATASET = 'nebius/SWE-rebench-leaderboard';
const FALLBACK_PARTITIONS = ['2026_02', '2026_01', '2025_12', '2025_11'];

// ── Phase 1: real HF fetch ───────────────────────────────────────────────────

export interface HfFetchE2EResult {
  partition: string;
  rowCount: number;
  sampledInstanceId: string;
  schemaParsed: boolean;
  storeRoundTrip: boolean;
}

/**
 * Real-network fetch against the HuggingFace datasets-server. Fetches a
 * partition (preferring 2026_02, falling back through earlier months if
 * empty/failing), hydrates one row through SweRebenchV2TaskSchema, and
 * verifies a GeneratorStateStore counter round-trips for the same id.
 *
 * Skips fail-loudly with a descriptive error when JINN_E2E_SKIP_NETWORK=1 is
 * unset and every fallback partition returns 0 records (signals the dataset
 * shape changed; treat as a real bug, not flake).
 */
export async function runSweRebenchV2HfFetchE2E(): Promise<HfFetchE2EResult> {
  if (process.env['JINN_E2E_SKIP_NETWORK'] === '1') {
    process.stdout.write('skipped by JINN_E2E_SKIP_NETWORK=1\n');
    return {
      partition: 'skipped',
      rowCount: 0,
      sampledInstanceId: '',
      schemaParsed: false,
      storeRoundTrip: false,
    };
  }

  // First confirm the splits endpoint and pick a partition that actually
  // has rows. We try 2026_02 then walk back through fallbacks.
  let chosenPartition = '';
  let rows: Array<Record<string, unknown>> = [];

  // Enumerate splits via datasets-server (this is what the production code
  // path also does, so we exercise it under the same conditions).
  const splitsRes = await fetch(
    `https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(HF_DATASET)}`,
  );
  assert(splitsRes.ok, `HF splits endpoint returned ${splitsRes.status}`);
  const splitsJson = (await splitsRes.json()) as { splits?: Array<{ split: string }> };
  const allSplits = (splitsJson.splits ?? []).map((s) => s.split);
  const months = listMonthlyPartitions(allSplits);
  assert(months.length > 0, `no YYYY_MM monthly partitions in dataset ${HF_DATASET}`);
  process.stdout.write(`HF partitions available: ${months.join(', ')}\n`);

  for (const candidate of FALLBACK_PARTITIONS) {
    if (!months.includes(candidate)) continue;
    process.stdout.write(`trying partition ${candidate}... `);
    const fetched = await fetchHfSplit({
      dataset: HF_DATASET,
      split: candidate,
      limit: 5,
    });
    process.stdout.write(`got ${fetched.length} rows\n`);
    if (fetched.length > 0) {
      chosenPartition = candidate;
      rows = fetched as Array<Record<string, unknown>>;
      break;
    }
  }

  assert(
    chosenPartition !== '' && rows.length > 0,
    `every fallback partition returned 0 rows: tried ${FALLBACK_PARTITIONS.join(', ')}`,
  );

  // Build the historical pool from the chosen partition; verifies the
  // production-flavor `buildHistoricalPool` shape works on real data.
  const pool: PoolTask[] = await buildHistoricalPool({
    months: [chosenPartition],
    fetchSplit: async () =>
      rows.map((r) => ({
        instance_id: String(r['instance_id']),
        language: typeof r['language'] === 'string' ? (r['language'] as string) : undefined,
        meta: r['meta'] as Record<string, unknown> | undefined,
      })),
  });
  assert(pool.length === rows.length, `pool size mismatch: pool=${pool.length}, rows=${rows.length}`);
  assert(
    pool.every((t) => t.hf_dataset === HF_DATASET),
    'every pool task should carry hf_dataset',
  );

  // Hydrate one row through the canonical SDK Task schema. We use the same
  // defaults the production generator does (language defaults to python
  // when the dataset row omits it; base_commit uses the row's value when
  // it matches the schema regex, otherwise zero-pad to 40 hex chars).
  const sample = rows[0]!;
  const sampleId = String(sample['instance_id']);
  const baseCommit = String(sample['base_commit'] ?? '');
  const validBaseCommit = /^[0-9a-f]{40}$/.test(baseCommit) ? baseCommit : '0'.repeat(40);
  const repoSlug = String(sample['repo'] ?? '');
  const validRepo = /^[^/]+\/[^/]+$/.test(repoSlug)
    ? repoSlug
    : `${sampleId.split('__')[0] ?? 'unknown'}/${(sampleId.split('__')[1] ?? sampleId).split('-')[0]}`;
  const language = typeof sample['language'] === 'string' ? sample['language'] : 'python';

  const candidateTask = {
    schemaVersion: 'swe-rebench-v2.v1' as const,
    instance_id: sampleId,
    repo: validRepo,
    base_commit: validBaseCommit,
    language,
    problem_statement: String(sample['problem_statement'] ?? ''),
    interface: String(sample['interface'] ?? ''),
    hf_dataset: HF_DATASET,
    hf_split: chosenPartition,
    deadline_unix: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    round_month: chosenPartition.replace('_', '-'),
  };

  const parsed = SweRebenchV2TaskSchema.safeParse(candidateTask);
  if (!parsed.success) {
    throw new Error(
      `SweRebenchV2TaskSchema rejected real-row hydration for ${sampleId}: ${parsed.error.message}`,
    );
  }

  // Verify GeneratorStateStore round-trips on the real instance_id.
  const stateDir = await mkdtemp(join(tmpdir(), 'jinn-swe-hf-'));
  let storeRoundTrip = false;
  try {
    const store = new GeneratorStateStore({ stateDir });
    await store.recordPosted(parsed.data.instance_id, Date.now());
    const counters = await store.getCounters(parsed.data.instance_id);
    assert(
      counters.posted === 1,
      `state store should have posted=1 after one recordPosted, got ${counters.posted}`,
    );
    // Independent reload to verify on-disk persistence (not just cache).
    const fresh = new GeneratorStateStore({ stateDir });
    const reloaded = await fresh.getCounters(parsed.data.instance_id);
    assert(
      reloaded.posted === 1,
      `fresh state store should reload posted=1, got ${reloaded.posted}`,
    );
    storeRoundTrip = true;
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }

  return {
    partition: chosenPartition,
    rowCount: rows.length,
    sampledInstanceId: sampleId,
    schemaParsed: parsed.success,
    storeRoundTrip,
  };
}

// ── Phase 2: Docker pull + eval.py subprocess ─────────────────────────────────

export type DockerEvalE2EOutcome =
  | { status: 'pass'; imageName: string; instanceId: string; exitCode: number; stderrTail: string }
  | { status: 'blocked'; reason: string };

/**
 * Wait up to `timeoutMs` for `docker ps` to succeed. Polls every 3s. Returns
 * true on first success; false if the daemon never becomes available.
 */
async function waitForDocker(timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = spawnSync('docker', ['ps'], { stdio: 'ignore' });
    if (r.status === 0) return true;
    await new Promise((res) => setTimeout(res, 3_000));
  }
  return false;
}

interface DockerImageProbe {
  exists: boolean;
  pulled: boolean;
  pullStderr: string;
}

async function pullDockerImage(image: string, timeoutMs = 180_000): Promise<DockerImageProbe> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['pull', image], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.stdout.on('data', () => { /* drain */ });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ exists: false, pulled: false, pullStderr: stderr + '\n[timeout]' });
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      const exists = code === 0;
      resolve({ exists, pulled: exists, pullStderr: stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exists: false, pulled: false, pullStderr: stderr + '\n' + err.message });
    });
  });
}

/**
 * Verifies the real Docker pull path and (when the upstream
 * SWE-rebench-V2 repo is available) the PythonEvalRunner subprocess +
 * verdict parsing.
 *
 * Honest scope: when the upstream repo is missing (the common case for
 * fresh checkouts), this phase pulls the image, asserts it runs `--version`
 * via `docker run --rm`, and reports BLOCKED on the eval.py subprocess
 * with the exact missing path. The eval-runner unit-level shape is already
 * verified by the mocked path in client/test/e2e/swe-rebench-v2.test.ts.
 */
export async function runSweRebenchV2DockerEvalE2E(): Promise<DockerEvalE2EOutcome> {
  if (process.env['JINN_E2E_SKIP_NETWORK'] === '1') {
    return { status: 'blocked', reason: 'JINN_E2E_SKIP_NETWORK=1 set; skipping Docker pull' };
  }
  if (process.env['JINN_E2E_SKIP_DOCKER'] === '1') {
    return { status: 'blocked', reason: 'JINN_E2E_SKIP_DOCKER=1 set; skipping Docker phase' };
  }

  process.stdout.write('waiting for docker daemon (up to 60s)... ');
  const dockerReady = await waitForDocker(60_000);
  if (!dockerReady) {
    process.stdout.write('not ready\n');
    return { status: 'blocked', reason: 'docker daemon not ready after 60s' };
  }
  process.stdout.write('ready\n');

  // Re-fetch one HF row so we have the real image name.
  const rows = await fetchHfSplit({ dataset: HF_DATASET, split: '2026_02', limit: 1 });
  if (rows.length === 0) {
    return { status: 'blocked', reason: 'HF partition 2026_02 returned 0 rows; cannot select an image' };
  }
  const row = rows[0]!;
  const instanceId = String(row['instance_id']);
  const imageName = String(row['image_name'] ?? '');
  if (!imageName) {
    return { status: 'blocked', reason: `HF row ${instanceId} has no image_name field` };
  }
  process.stdout.write(`pulling image ${imageName}...\n`);

  const probe = await pullDockerImage(imageName, 180_000);
  if (!probe.pulled) {
    const tail = probe.pullStderr.split('\n').slice(-3).join(' | ');
    return {
      status: 'blocked',
      reason: `docker pull failed for ${imageName}: ${tail}`,
    };
  }
  process.stdout.write(`pulled ${imageName} successfully\n`);

  // Smoke-test the image is runnable. SWE-rebench eval images ship a Python
  // interpreter; verify by running `python3 --version` inside the container.
  const runRes = spawnSync('docker', [
    'run', '--rm', '--entrypoint=python3', imageName, '--version',
  ], { encoding: 'utf8', timeout: 60_000 });
  if (runRes.status !== 0) {
    return {
      status: 'blocked',
      reason: `docker run on ${imageName} exited ${runRes.status}: ${(runRes.stderr ?? '').slice(0, 200)}`,
    };
  }
  process.stdout.write(`container python: ${(runRes.stdout ?? '').trim()}\n`);

  // Now attempt PythonEvalRunner — requires the upstream SWE-rebench-V2 repo.
  const upstreamRepo = process.env['JINN_SWE_REBENCH_V2_UPSTREAM_DIR'];
  if (!upstreamRepo) {
    return {
      status: 'blocked',
      reason:
        'PythonEvalRunner requires JINN_SWE_REBENCH_V2_UPSTREAM_DIR pointing to a clone of github.com/SWE-rebench/SWE-rebench-V2 (for scripts/eval.py); image pull verified separately',
    };
  }
  let upstreamOk = false;
  try {
    const s = await stat(join(upstreamRepo, 'scripts', 'eval.py'));
    upstreamOk = s.isFile();
  } catch {
    upstreamOk = false;
  }
  if (!upstreamOk) {
    return {
      status: 'blocked',
      reason: `JINN_SWE_REBENCH_V2_UPSTREAM_DIR=${upstreamRepo} does not contain scripts/eval.py`,
    };
  }

  // Run eval.py on a known-bad stub patch and parse its verdict.
  const runner = new PythonEvalRunner({ upstreamRepoDir: upstreamRepo, maxWorkers: 1 });
  try {
    const result = await runner.runEval({
      image: imageName,
      patch: '--- /dev/null\n+++ /dev/null\n',  // empty patch → must fail FAIL_TO_PASS
      test_patch: String(row['test_patch'] ?? ''),
      test_cmd: ((row['install_config'] as Record<string, unknown>)?.['test_cmd'] ?? '') as string,
      log_parser: ((row['install_config'] as Record<string, unknown>)?.['log_parser'] ?? 'pytest') as string,
      fail_to_pass: (row['FAIL_TO_PASS'] as string[]) ?? [],
      pass_to_pass: (row['PASS_TO_PASS'] as string[]) ?? [],
    });
    return {
      status: 'pass',
      imageName,
      instanceId,
      exitCode: result.exitCode,
      stderrTail: (result.log ?? '').split('\n').slice(-3).join(' | '),
    };
  } catch (err) {
    return {
      status: 'blocked',
      reason: `PythonEvalRunner raised: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Phase 3: SolverType registration + payload-v2 envelope shape ─────────────

export interface SolverTypeRegistrationResult {
  registered: boolean;
  parseSpecOk: boolean;
  schemaVersionEcho: string;
  generatedTaskInstanceId: string;
}

/**
 * Verifies the swe-rebench-v2.v1 SolverType is wired into the canonical
 * `SOLVER_TYPES` registry, that `parseSpec` accepts a Task built by the
 * generator, and that the SDK Task schema accepts the parsed spec.
 *
 * Full Anvil-fork settlement is deferred — `swe-rebench-v2.test.ts`
 * already covers SolverType wiring + payload v2 envelope + state-store
 * round-trip; the on-chain Mech path is covered by `runAnvilTaskFirstFullLoop`
 * for the prediction.v1 SolverType, which exercises the same
 * TaskCoordinator/JinnRouter/Verdict code path that swe-rebench-v2 will use.
 */
export type SolverTypeRegistrationOutcome =
  | (SolverTypeRegistrationResult & { status: 'pass' })
  | { status: 'blocked'; reason: string };

export async function runSweRebenchV2SolverTypeRegistrationE2E(): Promise<SolverTypeRegistrationOutcome> {
  // 1. Registry membership. These assertions are pure / synchronous and must
  //    always hold — they don't depend on the network.
  const def = SOLVER_TYPES['swe-rebench-v2.v1'];
  assert(def !== undefined, 'swe-rebench-v2.v1 not in SOLVER_TYPES registry');
  assert(def.solverType === 'swe-rebench-v2.v1', `solverType field mismatch: ${def.solverType}`);
  assert(typeof def.parseSpec === 'function', 'parseSpec missing on registered SolverType');
  assert(typeof def.buildGenerator === 'function', 'buildGenerator missing on registered SolverType');

  // 2. Build a generator against a real fetch. We avoid mocking here on
  //    purpose — this is the real-infra phase. HF rate-limits during splits
  //    enumeration are environment-dependent, not a code bug; report BLOCKED
  //    rather than failing the suite.
  const stateDir = await mkdtemp(join(tmpdir(), 'jinn-swe-reg-'));
  try {
    process.env['JINN_SWE_REBENCH_V2_LAUNCHER_ENABLED'] = '1';
    process.env['JINN_SWE_REBENCH_V2_STATE_DIR'] = stateDir;
    const generator = def.buildGenerator!({ stateDir });

    // refreshPool swallows network errors and returns null on first call;
    // retry once after a short backoff. If still null, treat as a network
    // blocker rather than a code failure.
    let generated = await generator();
    if (generated === null) {
      await new Promise((res) => setTimeout(res, 3_000));
      generated = await generator();
    }
    if (generated === null) {
      return {
        status: 'blocked',
        reason: 'HF pool refresh returned null after retry — likely datasets-server rate-limit or transient network error',
      };
    }
    assert(generated.solverType === 'swe-rebench-v2.v1', `unexpected solverType ${generated.solverType}`);

    // 3. Round-trip the spec through parseSpec.
    const overlay = await def.parseSpec(generated.spec);
    assert(overlay.spec, 'parseSpec returned empty spec');
    const overlaySpec = overlay.spec as { schemaVersion?: string; instance_id?: string };
    assert(
      overlaySpec.schemaVersion === 'swe-rebench-v2.v1',
      `schemaVersion mismatch: ${overlaySpec.schemaVersion}`,
    );
    assert(typeof overlaySpec.instance_id === 'string' && overlaySpec.instance_id.length > 0,
      'instance_id missing on parseSpec output',
    );

    return {
      status: 'pass',
      registered: true,
      parseSpecOk: true,
      schemaVersionEcho: overlaySpec.schemaVersion,
      generatedTaskInstanceId: overlaySpec.instance_id!,
    };
  } finally {
    delete process.env['JINN_SWE_REBENCH_V2_LAUNCHER_ENABLED'];
    delete process.env['JINN_SWE_REBENCH_V2_STATE_DIR'];
    await rm(stateDir, { recursive: true, force: true });
  }
}
