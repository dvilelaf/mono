import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesiredState } from '@/types/desired-state.js';
import type { RestorationContext } from '@/restorer/types.js';

export interface RestorationCtxOpts {
  intent: DesiredState;
  intentCid?: string;
  /** mkdtemp prefix; default 'jinn-restoration-ctx-'. */
  prefix?: string;
  /**
   * When true, allocates separate `workingDir` + `implStateDir` subdirs under
   * one temp root. Default false (both point to the same temp dir, matching
   * most legacy `makeCtx` shapes).
   */
  separateDirs?: boolean;
  msUntilEndTs?: () => number;
  abort?: AbortSignal;
  log?: RestorationContext['log'];
  /**
   * Extra fields attached to the returned context. Some impls read test-only
   * properties via `(ctx as any)._testDeps` — pass them here.
   */
  extra?: Record<string, unknown>;
}

/**
 * Canonical `RestorationContext` builder for restorer-impl tests. Replaces the
 * 6 ad-hoc `makeCtx` helpers across `test/restorer/impls/`. Each call creates
 * a fresh tempdir; tests that need cleanup may track the returned dirs.
 */
export function makeRestorationCtx(opts: RestorationCtxOpts): RestorationContext {
  const root = mkdtempSync(join(tmpdir(), opts.prefix ?? 'jinn-restoration-ctx-'));
  let workingDir = root;
  let implStateDir = root;
  if (opts.separateDirs) {
    workingDir = join(root, 'work');
    implStateDir = join(root, 'state');
    mkdirSync(workingDir);
    mkdirSync(implStateDir);
  }
  const ctx: RestorationContext = {
    intent: opts.intent,
    workingDir,
    implStateDir,
    log: opts.log ?? (() => {}),
    abort: opts.abort ?? new AbortController().signal,
    msUntilEndTs: opts.msUntilEndTs ?? (() => 0),
  };
  if (opts.intentCid !== undefined) {
    ctx.intentCid = opts.intentCid;
  }
  if (opts.extra) {
    Object.assign(ctx as unknown as Record<string, unknown>, opts.extra);
  }
  return ctx;
}
