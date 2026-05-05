/**
 * Launcher mode HTTP routes. Mounted under `/v1/launcher/*` and gated by the
 * shared UI token (see server.ts). This module is intentionally thin — the
 * heavy lifting lives in `launcher-status.ts` / `launcher-tasks.ts` so each
 * gather function can be unit-tested without spinning up the full Hono server.
 *
 * Spec: spec/2026-05-05-launcher-role-and-mode.md §5.3, §5.2 (hot-spawn),
 *       §6.6 (launcher config page).
 *
 * Currently registers:
 *   GET   /v1/launcher/status              — per-SolverNet generator + budget snapshot.
 *   GET   /v1/launcher/tasks               — paginated posted-Task list (Task 7).
 *   PATCH /v1/launcher/solvernets/:name    — toggle launching role + edit generator config (Task 8).
 */
import type { Hono } from 'hono';
import {
  gatherLauncherStatus,
  type GatherLauncherStatusDeps,
} from './launcher-status.js';
import {
  gatherLauncherTasks,
  type GatherLauncherTasksDeps,
} from './launcher-tasks.js';
import { DEFAULT_CONFIG_PATH, persistTopLevelConfigValue } from '../config.js';

export interface LauncherRoutesDeps extends Omit<GatherLauncherStatusDeps, 'config'> {
  /**
   * Read the live config snapshot. Resolved per-request so SolverNet edits
   * persisted via `/v1/setup/solvernets/:name` are reflected immediately —
   * the Launcher panel polls this endpoint and the operator should see
   * launching-role flips on the very next tick.
   */
  getConfig: () => GatherLauncherStatusDeps['config'];
  /**
   * Posted-Task accessor (Task 7). Resolved once at construction; the deps
   * shape narrows the cross-route surface area that route handlers can see.
   */
  tasksDeps: Omit<GatherLauncherTasksDeps, 'config'>;
  /**
   * Path to the operator config.json. Defaults to {@link DEFAULT_CONFIG_PATH}.
   * Override in tests.
   */
  configPath?: string;
  /**
   * Persist a top-level config key. Defaults to {@link persistTopLevelConfigValue}.
   * Override in tests so the helper writes to a temp dir or an in-memory mock.
   */
  persistConfigValue?: typeof persistTopLevelConfigValue;
  /**
   * Cache-invalidation hook fired after a successful PATCH that mutates
   * `solverNets`. Mirrors `setup-endpoints.ts`'s `onSolverNetsUpdated` so the
   * gather-status WeakMap (jinn-mono-l2zl.15.4.12) is dropped before the next
   * `/v1/launcher/status` read.
   */
  onSolverNetsUpdated?: (solverNets: Record<string, Record<string, unknown>>) => void;
  /**
   * Hot-apply hook for top-level generator config keys. The route persists
   * these keys to disk, then calls this hook so the running daemon's live
   * config object observes the same values before the next generator tick.
   */
  onConfigValuesUpdated?: (values: Record<string, unknown>) => void;
}

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const CURSOR_PREFIX = 'before:';

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(parsed)));
}

function parseCursor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith(CURSOR_PREFIX)) return raw.slice(CURSOR_PREFIX.length);
  // Be permissive: a bare ISO timestamp is treated as `before:<iso>` so the
  // SPA can pass either form without a wrapper layer.
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Map the launcher-mode `generator: { ... }` body into the daemon's flat
 * top-level `predictionV1*` config keys. Only keys present in the input are
 * emitted, so callers can patch a single field without clobbering the rest.
 *
 * Keep this table in sync with the predictionV1 fields in `JinnConfigSchema`
 * (client/src/config.ts).
 */
function mapGeneratorPatch(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  if ('cadenceMs' in input) out['predictionV1CadenceMs'] = input['cadenceMs'];
  if ('maxNewRoundsPerPoll' in input)
    out['predictionV1MaxNewRoundsPerPoll'] = input['maxNewRoundsPerPoll'];
  if ('maxNewRoundsPerDay' in input)
    out['predictionV1MaxNewRoundsPerDay'] = input['maxNewRoundsPerDay'];
  if ('maxOpenRounds' in input) out['predictionV1MaxOpenRounds'] = input['maxOpenRounds'];
  if ('allowlistConditionIds' in input)
    out['predictionV1AllowlistConditionIds'] = input['allowlistConditionIds'];
  if ('blocklistConditionIds' in input)
    out['predictionV1BlocklistConditionIds'] = input['blocklistConditionIds'];
  if ('windowMs' in input) out['predictionV1WindowMs'] = input['windowMs'];
  if ('resolveGapMs' in input) out['predictionV1ResolveGapMs'] = input['resolveGapMs'];
  return out;
}

export function addLauncherRoutes(app: Hono, deps: LauncherRoutesDeps): void {
  const persistConfigValue = deps.persistConfigValue ?? persistTopLevelConfigValue;
  const configPath = deps.configPath ?? DEFAULT_CONFIG_PATH;

  app.get('/v1/launcher/status', async (c) => {
    const body = await gatherLauncherStatus({ ...deps, config: deps.getConfig() });
    return c.json(body);
  });

  app.get('/v1/launcher/tasks', async (c) => {
    const limit = parseLimit(c.req.query('limit'));
    const before = parseCursor(c.req.query('cursor'));
    const body = await gatherLauncherTasks(
      { ...deps.tasksDeps, config: deps.getConfig() },
      { limit, ...(before ? { before } : {}) },
    );
    return c.json(body);
  });

  // Launcher-mode SolverNet patch. Owns the `'launching'` role and the
  // top-level generator-config keys (predictionV1CadenceMs, etc.). Operator
  // mode owns 'solving' / 'evaluating' via POST /v1/setup/solvernets/:name —
  // strict separation per spec §3.
  //
  // Per spec §5.2, generator-config edits hot-apply (no restart required) —
  // the daemon's generator polls re-read `config.predictionV1CadenceMs` etc.
  // each tick. Role flips also hot-apply because the launcher loop's
  // hot-spawn gate reads `roles.includes('launching')` per tick.
  app.patch('/v1/launcher/solvernets/:name', async (c) => {
    const name = c.req.param('name');
    if (!name) {
      return c.json({ error: 'invalid_invocation', message: 'missing solvernet name' }, 400);
    }

    let body: { launching?: unknown; generator?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_body', message: 'expected JSON body' }, 400);
    }

    if (body.launching !== undefined && typeof body.launching !== 'boolean') {
      return c.json(
        { error: 'invalid_body', message: '`launching` must be a boolean' },
        400,
      );
    }
    if (body.generator !== undefined && !isRecord(body.generator)) {
      return c.json(
        { error: 'invalid_body', message: '`generator` must be an object' },
        400,
      );
    }

    const config = deps.getConfig();
    const existing = config.solverNets?.[name];
    if (!existing || !isRecord(existing)) {
      const available = Object.keys(config.solverNets ?? {});
      return c.json({ error: 'solvernet_not_found', name, available, message: 'Unknown SolverNet' }, 404);
    }

    // Compute the next roles array, preserving any operator-mode roles that
    // were already there. Mirrors the operator-mode preservation pass in
    // setup-endpoints.ts (which preserves 'launching' on the way in).
    const existingRoles = Array.isArray(existing['roles'])
      ? (existing['roles'] as unknown[]).filter((r): r is string => typeof r === 'string')
      : [];
    let newRoles: string[] = existingRoles;
    if (body.launching === true) {
      newRoles = Array.from(new Set([...existingRoles, 'launching']));
    } else if (body.launching === false) {
      newRoles = existingRoles.filter((r) => r !== 'launching');
    }
    if (newRoles.length === 0) {
      return c.json(
        { error: 'invalid_body', message: 'At least one role required — refusing to leave SolverNet without any roles' },
        400,
      );
    }

    // Build the next solverNets snapshot. Persist the whole object via
    // persistTopLevelConfigValue so the cache-invalidation hook receives the
    // complete post-edit state (matching setup-endpoints.ts).
    const nextSolverNets: Record<string, Record<string, unknown>> = {};
    for (const [netName, netConfig] of Object.entries(config.solverNets ?? {})) {
      if (isRecord(netConfig)) nextSolverNets[netName] = { ...netConfig };
    }
    nextSolverNets[name] = { ...(nextSolverNets[name] ?? {}), roles: newRoles };

    const generatorPatch = mapGeneratorPatch(
      isRecord(body.generator) ? body.generator : undefined,
    );

    try {
      // Roles change → write solverNets first so the invalidation hook sees
      // the fresh roles snapshot before any generator-config keys are read.
      if (body.launching !== undefined) {
        persistConfigValue('solverNets', nextSolverNets, configPath);
        deps.onSolverNetsUpdated?.(nextSolverNets);
      }
      // Top-level generator keys are independent of solverNets, so persist
      // each one individually. The values flow through the daemon's
      // per-tick config reads (no restart needed; spec §5.2).
      for (const [key, value] of Object.entries(generatorPatch)) {
        persistConfigValue(key, value, configPath);
      }
      if (Object.keys(generatorPatch).length > 0) {
        deps.onConfigValuesUpdated?.(generatorPatch);
      }
    } catch (err) {
      return c.json(
        {
          error: 'config_write_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    return c.json({
      ok: true,
      name,
      roles: newRoles,
      generator: generatorPatch,
    });
  });
}
