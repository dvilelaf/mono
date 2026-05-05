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
}

function buildTestApp(args: BuildArgs): { app: Hono; token: string } {
  const app = new Hono();
  if (args.withAuth ?? true) {
    app.use('/v1/launcher', requireUiToken(UI_TOKEN));
    app.use('/v1/launcher/*', requireUiToken(UI_TOKEN));
  }
  addLauncherRoutes(app, {
    getConfig: () => ({ solverNets: args.solverNets ?? {} } as Pick<JinnConfig, 'solverNets'>),
    getGeneratorState: (name) => args.generatorStates?.[name],
    getOpenTaskCount: (name) => args.openTaskCount?.(name) ?? 0,
    getReservedBudgetWei: (name) => args.reservedBudgetWei?.(name) ?? '0',
    getSafeBalanceWei: () => args.safeBalanceWei ?? '0',
    safeAddress: SAFE_ADDRESS,
    now: args.now !== undefined ? () => args.now! : undefined,
  });
  return { app, token: UI_TOKEN };
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
