/**
 * Launcher mode HTTP routes. Mounted under `/v1/launcher/*` and gated by the
 * shared UI token (see server.ts). This module is intentionally thin — the
 * heavy lifting lives in `launcher-status.ts` so it can be unit-tested
 * without spinning up the full Hono server.
 *
 * Spec: spec/2026-05-05-launcher-role-and-mode.md §5.3.
 *
 * Currently registers:
 *   GET /v1/launcher/status — per-SolverNet generator + budget snapshot.
 *
 * Future tasks (Task 7+) will add `/v1/launcher/tasks` etc. on the same
 * deps shape.
 */
import type { Hono } from 'hono';
import {
  gatherLauncherStatus,
  type GatherLauncherStatusDeps,
} from './launcher-status.js';

export interface LauncherRoutesDeps extends Omit<GatherLauncherStatusDeps, 'config'> {
  /**
   * Read the live config snapshot. Resolved per-request so SolverNet edits
   * persisted via `/v1/setup/solvernets/:name` are reflected immediately —
   * the Launcher panel polls this endpoint and the operator should see
   * launching-role flips on the very next tick.
   */
  getConfig: () => GatherLauncherStatusDeps['config'];
}

export function addLauncherRoutes(app: Hono, deps: LauncherRoutesDeps): void {
  app.get('/v1/launcher/status', async (c) => {
    const body = await gatherLauncherStatus({ ...deps, config: deps.getConfig() });
    return c.json(body);
  });
}
