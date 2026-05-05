/**
 * Launcher mode HTTP routes. Mounted under `/v1/launcher/*` and gated by the
 * shared UI token (see server.ts). This module is intentionally thin — the
 * heavy lifting lives in `launcher-status.ts` / `launcher-tasks.ts` so each
 * gather function can be unit-tested without spinning up the full Hono server.
 *
 * Spec: spec/2026-05-05-launcher-role-and-mode.md §5.3.
 *
 * Currently registers:
 *   GET /v1/launcher/status — per-SolverNet generator + budget snapshot.
 *   GET /v1/launcher/tasks  — paginated posted-Task list (Task 7).
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

export function addLauncherRoutes(app: Hono, deps: LauncherRoutesDeps): void {
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
}
