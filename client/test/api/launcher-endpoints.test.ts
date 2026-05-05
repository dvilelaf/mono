/**
 * Launcher mode endpoint tests. Boilerplate matches setup-endpoints.test.ts:
 * each test stands up a fresh Hono app, registers the launcher routes with
 * deterministic deps, and asserts the response shape. The gather function
 * itself is exercised through the route — the route layer is thin enough
 * that one test surface covers both.
 *
 * Spec: spec/2026-05-05-launcher-role-and-mode.md §5.3.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { addLauncherRoutes } from '../../src/api/launcher-endpoints.js';
import { requireUiToken } from '../../src/api/handshake.js';
import type { JinnConfig } from '../../src/config.js';
import type { LauncherGeneratorStateSnapshot } from '../../src/api/launcher-status.js';
import type {
  PostedTaskRecord,
  FetchPostedTasksOptions,
} from '../../src/api/launcher-tasks.js';

const UI_TOKEN = 'ui-token-test';
const SAFE_ADDRESS = '0x0000000000000000000000000000000000000abc';

interface BuildArgs {
  solverNets?: JinnConfig['solverNets'];
  generatorStates?: Record<string, LauncherGeneratorStateSnapshot | undefined>;
  openTaskCount?: (netName: string) => number;
  reservedBudgetWei?: (netName: string) => string;
  safeBalanceWei?: string;
  now?: number;
  /** Mount the UI-token gate (mirrors server.ts wiring). */
  withAuth?: boolean;
  /**
   * Posted-Task fixtures for the `GET /v1/launcher/tasks` endpoint. Either a
   * static list (the test harness applies the `before`/`limit` filter), or a
   * function that receives the gather options and returns a tailored list.
   */
  postedTasks?:
    | PostedTaskRecord[]
    | ((opts: FetchPostedTasksOptions) => PostedTaskRecord[]);
}

/**
 * In-memory persistence shim for the PATCH endpoint. Mirrors the on-disk
 * shape that {@link import('../../src/config.js').persistTopLevelConfigValue}
 * would produce so tests can assert against the full post-write snapshot
 * without touching the filesystem.
 */
function buildPersistShim(): {
  persistConfigValue: (key: string, value: unknown, configPath?: string) => string;
  read: () => Record<string, unknown>;
} {
  const store: Record<string, unknown> = {};
  return {
    persistConfigValue: (key, value) => {
      store[key] = value;
      return '/tmp/test-config.json';
    },
    read: () => ({ ...store }),
  };
}

function defaultFetchPostedTasks(
  fixtures: PostedTaskRecord[] | undefined,
  spy?: { lastOpts?: FetchPostedTasksOptions },
): (opts: FetchPostedTasksOptions) => PostedTaskRecord[] {
  return (opts) => {
    if (spy) spy.lastOpts = opts;
    if (!fixtures) return [];
    const sorted = [...fixtures].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
    const filtered = opts.before
      ? sorted.filter((r) => Date.parse(r.postedAt) < Date.parse(opts.before!))
      : sorted;
    return filtered.slice(0, opts.limit);
  };
}

function buildTestApp(args: BuildArgs): {
  app: Hono;
  token: string;
  fetchSpy: { lastOpts?: FetchPostedTasksOptions };
  /** Returns the in-memory persisted snapshot (mirrors config.json on disk). */
  readPersistedConfig: () => Record<string, unknown>;
  /** Returns the most recent solverNets payload passed to onSolverNetsUpdated. */
  readNotifiedSolverNets: () => Record<string, Record<string, unknown>> | undefined;
  /** Returns the mutable live config view after hot-apply hooks run. */
  readLiveConfig: () => Record<string, unknown>;
} {
  const app = new Hono();
  if (args.withAuth ?? true) {
    app.use('/v1/launcher', requireUiToken(UI_TOKEN));
    app.use('/v1/launcher/*', requireUiToken(UI_TOKEN));
  }
  const fetchSpy: { lastOpts?: FetchPostedTasksOptions } = {};
  const fetchPostedTasks =
    typeof args.postedTasks === 'function'
      ? (opts: FetchPostedTasksOptions) => {
          fetchSpy.lastOpts = opts;
          return (args.postedTasks as (o: FetchPostedTasksOptions) => PostedTaskRecord[])(opts);
        }
      : defaultFetchPostedTasks(args.postedTasks, fetchSpy);
  // Live, mutable solverNets so PATCH can read the latest snapshot via
  // getConfig() (the production wiring does the same thing — main.ts mutates
  // `config.solverNets` in place from the onSolverNetsUpdated hook).
  let liveSolverNets: JinnConfig['solverNets'] | undefined = args.solverNets ?? {};
  const liveConfig: Record<string, unknown> = { solverNets: liveSolverNets };
  const persistShim = buildPersistShim();
  let lastNotified: Record<string, Record<string, unknown>> | undefined;
  addLauncherRoutes(app, {
    getConfig: () => ({ solverNets: liveSolverNets } as Pick<JinnConfig, 'solverNets'>),
    getGeneratorState: (name) => args.generatorStates?.[name],
    getOpenTaskCount: (name) => args.openTaskCount?.(name) ?? 0,
    getReservedBudgetWei: (name) => args.reservedBudgetWei?.(name) ?? '0',
    getSafeBalanceWei: () => args.safeBalanceWei ?? '0',
    safeAddress: SAFE_ADDRESS,
    now: args.now !== undefined ? () => args.now! : undefined,
    tasksDeps: {
      creatorAddress: SAFE_ADDRESS,
      fetchPostedTasks,
      now: args.now !== undefined ? () => args.now! : undefined,
    },
    persistConfigValue: persistShim.persistConfigValue,
    onSolverNetsUpdated: (solverNets) => {
      lastNotified = solverNets;
      // Mirror main.ts: keep the live config snapshot pointed at the
      // post-edit object so subsequent reads (status, follow-up patches)
      // see the fresh state.
      liveSolverNets = solverNets as JinnConfig['solverNets'];
      liveConfig['solverNets'] = liveSolverNets;
    },
    onConfigValuesUpdated: (values) => {
      Object.assign(liveConfig, values);
    },
  });
  return {
    app,
    token: UI_TOKEN,
    fetchSpy,
    readPersistedConfig: persistShim.read,
    readNotifiedSolverNets: () => lastNotified,
    readLiveConfig: () => ({ ...liveConfig }),
  };
}

const launchingNet = {
  enabled: true,
  solverType: 'prediction.v1',
  roles: ['launching'] as const,
  harness: 'claude-code-learner',
  plugins: [],
  taskGenerator: { enabled: true },
} as never;

const solvingNet = {
  enabled: true,
  solverType: 'prediction.v1',
  roles: ['solving'] as const,
  harness: 'claude-code-learner',
  plugins: [],
  taskGenerator: { enabled: true },
} as never;

describe('GET /v1/launcher/status', () => {
  it('returns per-net launcher status for nets with launching role', async () => {
    const { app, token } = buildTestApp({
      solverNets: { prediction: launchingNet },
      generatorStates: {
        prediction: {
          lastPollAt: '2026-05-05T10:00:00.000Z',
          lastPollSummary: { evaluated: 12, posted: 3, skipped: 9 },
          cadenceMs: 6 * 60 * 60 * 1000,
        },
      },
      openTaskCount: () => 7,
      reservedBudgetWei: () => '1000000000000000000',
      safeBalanceWei: '5000000000000000000',
      now: Date.parse('2026-05-05T11:00:00.000Z'),
    });

    const res = await app.request('/v1/launcher/status', {
      headers: { 'x-jinn-ui-token': token },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      schemaVersion: number;
      nets: Array<{
        name: string;
        generator: { state: string; cadenceMs: number; stale: boolean; lastPollAt?: string; lastPollSummary?: unknown };
        openTasks: number;
        budget: { safeAddress: string; safeBalanceWei: string; reservedBudgetWei: string };
      }>;
    };
    expect(body.schemaVersion).toBe(1);
    expect(body.nets).toHaveLength(1);
    expect(body.nets[0]).toMatchObject({
      name: 'prediction',
      generator: {
        state: 'active',
        cadenceMs: 6 * 60 * 60 * 1000,
        stale: false,
        lastPollAt: '2026-05-05T10:00:00.000Z',
        lastPollSummary: { evaluated: 12, posted: 3, skipped: 9 },
      },
      openTasks: 7,
      budget: {
        safeAddress: SAFE_ADDRESS,
        safeBalanceWei: '5000000000000000000',
        reservedBudgetWei: '1000000000000000000',
      },
    });
  });

  it('omits nets without launching role', async () => {
    const { app, token } = buildTestApp({
      solverNets: { prediction: solvingNet },
    });
    const res = await app.request('/v1/launcher/status', {
      headers: { 'x-jinn-ui-token': token },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { nets: unknown[] };
    expect(body.nets).toEqual([]);
  });

  it('reports stale=true when lastPollAt is older than 2x cadence', async () => {
    const cadenceMs = 60_000;
    const now = Date.parse('2026-05-05T12:00:00.000Z');
    const { app, token } = buildTestApp({
      solverNets: { prediction: launchingNet },
      generatorStates: {
        prediction: {
          lastPollAt: new Date(now - 3 * cadenceMs).toISOString(),
          cadenceMs,
        },
      },
      now,
    });
    const res = await app.request('/v1/launcher/status', {
      headers: { 'x-jinn-ui-token': token },
    });
    const body = await res.json() as {
      nets: Array<{ generator: { stale: boolean; state: string } }>;
    };
    expect(body.nets[0]?.generator.stale).toBe(true);
    // No lastError → still 'active', stale flag is the operator-visible signal.
    expect(body.nets[0]?.generator.state).toBe('active');
  });

  it('reports state=errored when the generator surfaced lastError', async () => {
    const { app, token } = buildTestApp({
      solverNets: { prediction: launchingNet },
      generatorStates: {
        prediction: {
          lastPollAt: '2026-05-05T10:00:00.000Z',
          lastError: { message: 'polymarket 503', at: '2026-05-05T10:00:01.000Z' },
          cadenceMs: 60_000,
        },
      },
      now: Date.parse('2026-05-05T10:00:30.000Z'),
    });
    const res = await app.request('/v1/launcher/status', {
      headers: { 'x-jinn-ui-token': token },
    });
    const body = await res.json() as {
      nets: Array<{ generator: { state: string; lastError?: { message: string } } }>;
    };
    expect(body.nets[0]?.generator.state).toBe('errored');
    expect(body.nets[0]?.generator.lastError?.message).toBe('polymarket 503');
  });

  it('reports state=paused when no generator state has been recorded yet', async () => {
    const { app, token } = buildTestApp({
      solverNets: { prediction: launchingNet },
      generatorStates: { prediction: undefined },
    });
    const res = await app.request('/v1/launcher/status', {
      headers: { 'x-jinn-ui-token': token },
    });
    const body = await res.json() as {
      nets: Array<{ generator: { state: string; cadenceMs: number; stale: boolean } }>;
    };
    expect(body.nets[0]?.generator.state).toBe('paused');
    expect(body.nets[0]?.generator.cadenceMs).toBe(0);
    expect(body.nets[0]?.generator.stale).toBe(false);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp({
      solverNets: { prediction: launchingNet },
    });
    const res = await app.request('/v1/launcher/status');
    expect(res.status).toBe(401);
  });
});

interface TasksResponseBody {
  schemaVersion: number;
  generatedAt: string;
  cursor?: { before: string };
  tasks: Array<{
    taskId: string;
    taskCid: string;
    solverNet: string;
    postedAt: string;
    state: string;
    claims: { current: number; max: number };
    budget: { totalWei: string; remainingWei: string; reclaimableAt?: string };
    summary?: { title?: string; resolutionTime?: string };
  }>;
}

describe('GET /v1/launcher/tasks', () => {
  it('returns tasks posted by this daemon creator, most recent first', async () => {
    const { app, token } = buildTestApp({
      solverNets: { prediction: launchingNet },
      postedTasks: [
        {
          taskId: '0xa',
          taskCid: 'Qma',
          solverType: 'prediction.v1',
          postedAt: '2026-05-05T10:00:00.000Z',
        },
        {
          taskId: '0xb',
          taskCid: 'Qmb',
          solverType: 'prediction.v1',
          postedAt: '2026-05-05T11:00:00.000Z',
        },
      ],
    });
    const res = await app.request('/v1/launcher/tasks', {
      headers: { 'x-jinn-ui-token': token },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TasksResponseBody;
    expect(body.schemaVersion).toBe(1);
    expect(body.tasks).toHaveLength(2);
    expect(body.tasks[0]?.taskId).toBe('0xb');
    expect(body.tasks[1]?.taskId).toBe('0xa');
    expect(body.tasks[0]?.solverNet).toBe('prediction');
    // Default state/claims/budget when the daemon doesn't yet track lifecycle.
    expect(body.tasks[0]?.state).toBe('open');
    expect(body.tasks[0]?.claims).toEqual({ current: 0, max: 25 });
    expect(body.tasks[0]?.budget).toEqual({ totalWei: '0', remainingWei: '0' });
    // No cursor because page is not full.
    expect(body.cursor).toBeUndefined();
  });

  it('respects ?cursor=before:<iso>&limit=N pagination', async () => {
    const fixtures: PostedTaskRecord[] = [
      { taskId: '0xa', taskCid: 'Qma', solverType: 'prediction.v1', postedAt: '2026-05-05T08:00:00.000Z' },
      { taskId: '0xb', taskCid: 'Qmb', solverType: 'prediction.v1', postedAt: '2026-05-05T09:00:00.000Z' },
      { taskId: '0xc', taskCid: 'Qmc', solverType: 'prediction.v1', postedAt: '2026-05-05T10:00:00.000Z' },
      { taskId: '0xd', taskCid: 'Qmd', solverType: 'prediction.v1', postedAt: '2026-05-05T11:00:00.000Z' },
    ];
    const { app, token, fetchSpy } = buildTestApp({
      solverNets: { prediction: launchingNet },
      postedTasks: fixtures,
    });

    // Page 1: limit=2, no cursor → newest two (0xd, 0xc), cursor = postedAt of 0xc.
    const page1Res = await app.request('/v1/launcher/tasks?limit=2', {
      headers: { 'x-jinn-ui-token': token },
    });
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as TasksResponseBody;
    expect(page1.tasks.map((t) => t.taskId)).toEqual(['0xd', '0xc']);
    expect(page1.cursor).toBeDefined();
    expect(page1.cursor?.before).toBe('2026-05-05T10:00:00.000Z');

    // Page 2: pass the cursor back (with the `before:` prefix). Use a
    // larger limit so the response is partial and the gather function
    // signals "no further page" by omitting the cursor.
    const cursorParam = `before:${page1.cursor!.before}`;
    const page2Res = await app.request(
      `/v1/launcher/tasks?limit=10&cursor=${encodeURIComponent(cursorParam)}`,
      { headers: { 'x-jinn-ui-token': token } },
    );
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as TasksResponseBody;
    expect(page2.tasks.map((t) => t.taskId)).toEqual(['0xb', '0xa']);
    // Partial page → no cursor.
    expect(page2.cursor).toBeUndefined();
    // The fetch dep saw the parsed before timestamp.
    expect(fetchSpy.lastOpts?.before).toBe('2026-05-05T10:00:00.000Z');
    expect(fetchSpy.lastOpts?.limit).toBe(10);
  });

  it('maps unknown solverType to solverNet="unknown" without dropping the row', async () => {
    const { app, token } = buildTestApp({
      solverNets: { prediction: launchingNet },
      postedTasks: [
        {
          taskId: '0xa',
          taskCid: 'Qma',
          solverType: 'mystery.v1',
          postedAt: '2026-05-05T10:00:00.000Z',
        },
      ],
    });
    const res = await app.request('/v1/launcher/tasks', {
      headers: { 'x-jinn-ui-token': token },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TasksResponseBody;
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]?.solverNet).toBe('unknown');
  });

  it('clamps limit to [1, 100]', async () => {
    const { app, token, fetchSpy } = buildTestApp({
      solverNets: { prediction: launchingNet },
      postedTasks: [],
    });
    await app.request('/v1/launcher/tasks?limit=999', {
      headers: { 'x-jinn-ui-token': token },
    });
    expect(fetchSpy.lastOpts?.limit).toBe(100);

    await app.request('/v1/launcher/tasks?limit=0', {
      headers: { 'x-jinn-ui-token': token },
    });
    expect(fetchSpy.lastOpts?.limit).toBe(1);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp({
      solverNets: { prediction: launchingNet },
      postedTasks: [],
    });
    const res = await app.request('/v1/launcher/tasks');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/launcher/solvernets/:name', () => {
  const solvingPredictionNet = {
    enabled: true,
    solverType: 'prediction.v1',
    roles: ['solving'],
    harness: 'claude-code-learner',
    plugins: [],
    taskGenerator: { enabled: true },
  } as never;

  const launchingAndSolvingNet = {
    enabled: true,
    solverType: 'prediction.v1',
    roles: ['solving', 'launching'],
    harness: 'claude-code-learner',
    plugins: [],
    taskGenerator: { enabled: true },
  } as never;

  const launchingOnlyNet = {
    enabled: true,
    solverType: 'prediction.v1',
    roles: ['launching'],
    harness: 'claude-code-learner',
    plugins: [],
    taskGenerator: { enabled: true },
  } as never;

  it('adds launching to roles and persists generator config', async () => {
    const { app, token, readPersistedConfig, readNotifiedSolverNets } = buildTestApp({
      solverNets: { prediction: solvingPredictionNet },
    });
    const res = await app.request('/v1/launcher/solvernets/prediction', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-jinn-ui-token': token },
      body: JSON.stringify({
        launching: true,
        generator: { cadenceMs: 30_000, maxNewRoundsPerPoll: 10 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; roles: string[] };
    expect(body.ok).toBe(true);
    expect(body.roles.sort()).toEqual(['launching', 'solving']);

    const persisted = readPersistedConfig();
    const persistedSolverNets = persisted['solverNets'] as Record<
      string,
      Record<string, unknown>
    >;
    expect((persistedSolverNets.prediction!['roles'] as string[]).sort()).toEqual([
      'launching',
      'solving',
    ]);
    expect(persisted['predictionV1CadenceMs']).toBe(30_000);
    expect(persisted['predictionV1MaxNewRoundsPerPoll']).toBe(10);

    // Cache invalidation hook fired with the post-edit solverNets snapshot.
    const notified = readNotifiedSolverNets();
    expect(notified).toBeDefined();
    expect((notified!.prediction!['roles'] as string[]).sort()).toEqual([
      'launching',
      'solving',
    ]);
  });

  it('removes launching from roles when launching: false', async () => {
    const { app, token, readPersistedConfig } = buildTestApp({
      solverNets: { prediction: launchingAndSolvingNet },
    });
    const res = await app.request('/v1/launcher/solvernets/prediction', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-jinn-ui-token': token },
      body: JSON.stringify({ launching: false }),
    });
    expect(res.status).toBe(200);
    const persisted = readPersistedConfig();
    const persistedSolverNets = persisted['solverNets'] as Record<
      string,
      Record<string, unknown>
    >;
    expect(persistedSolverNets.prediction!['roles']).toEqual(['solving']);
  });

  it('rejects launching: false when it would leave roles empty', async () => {
    const { app, token, readPersistedConfig } = buildTestApp({
      solverNets: { prediction: launchingOnlyNet },
    });
    const res = await app.request('/v1/launcher/solvernets/prediction', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-jinn-ui-token': token },
      body: JSON.stringify({ launching: false }),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { message?: string };
    expect(err.message).toMatch(/at least one role/i);
    // Refusal must not write anything.
    expect(readPersistedConfig()).toEqual({});
  });

  it('persists only generator-config keys when launching is omitted', async () => {
    const { app, token, readPersistedConfig, readNotifiedSolverNets, readLiveConfig } = buildTestApp({
      solverNets: { prediction: launchingAndSolvingNet },
    });
    const res = await app.request('/v1/launcher/solvernets/prediction', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-jinn-ui-token': token },
      body: JSON.stringify({
        generator: { allowlistConditionIds: ['0xabc', '0xdef'], windowMs: 90_000 },
      }),
    });
    expect(res.status).toBe(200);
    const persisted = readPersistedConfig();
    expect(persisted['predictionV1AllowlistConditionIds']).toEqual(['0xabc', '0xdef']);
    expect(persisted['predictionV1WindowMs']).toBe(90_000);
    expect(readLiveConfig()['predictionV1AllowlistConditionIds']).toEqual(['0xabc', '0xdef']);
    expect(readLiveConfig()['predictionV1WindowMs']).toBe(90_000);
    // Roles weren't touched → no solverNets write, no cache invalidation.
    expect(persisted['solverNets']).toBeUndefined();
    expect(readNotifiedSolverNets()).toBeUndefined();
  });

  it('returns 404 for unknown SolverNet', async () => {
    const { app, token } = buildTestApp({
      solverNets: { prediction: solvingPredictionNet },
    });
    const res = await app.request('/v1/launcher/solvernets/portfolio', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-jinn-ui-token': token },
      body: JSON.stringify({ launching: true }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; available: string[] };
    expect(body.error).toBe('solvernet_not_found');
    expect(body.available).toEqual(['prediction']);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp({
      solverNets: { prediction: solvingPredictionNet },
    });
    const res = await app.request('/v1/launcher/solvernets/prediction', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ launching: true }),
    });
    expect(res.status).toBe(401);
  });
});
