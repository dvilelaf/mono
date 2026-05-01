/**
 * Shared helpers for the `jinn intents` CLI surface.
 *
 * - Builds a HarnessRegistry populated with the same impls the daemon
 *   registers at boot (minus the ones that need live dependencies like a
 *   running master wallet). The generic `intents list/status/enable/disable`
 *   verbs use this to dispatch to per-impl onEnable / isReady logic without
 *   standing up the full daemon.
 *
 * - Reads/writes the `harnesses.disabled[]` list in the operator's config
 *   file so `enable` / `disable` can flip per-impl participation.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import { HarnessRegistry } from '../harnesses/engine/registry.js';
import { buildHarnesses } from '../harnesses/impls/index.js';
import type { JinnConfig } from '../config.js';

/**
 * Impls that ship default-disabled because they require external dependencies
 * (credentials, exchange approvals, etc.) the operator must opt into. Kept in
 * one place so `main.ts` and the `intents` CLI share a single source of truth.
 */
export const DEFAULT_DISABLED_IMPLS = ['claude-mcp-hyperliquid'] as const;
export const DEFAULT_BY_SOLVER_TYPE = {
  'portfolio.v0': 'claude-mcp-hyperliquid',
  'prediction.v0': 'prediction-v0-baseline',
  'prediction.apy.v0': 'prediction-apy-v0-baseline',
} as const;
export const DEFAULT_HARNESS = 'claude-code-learner';

const DEFAULT_CONFIG_PATH = join(homedir(), '.jinn-client', 'config.json');

export function resolveConfigPath(explicit?: string): string {
  return explicit ?? DEFAULT_CONFIG_PATH;
}

/**
 * Uses {@link buildHarnesses} with `stub: true` and no runner (no
 * `legacy-claude` — requires the daemon process + Claude runner).
 * Honest readiness for stub is refined in 7ee.2.
 *
 * @param buildImpls - Injectable factory (defaults to {@link buildHarnesses}).
 *   Pass a custom function in tests to observe the env arg without mocking the module.
 */
export function buildIntentsCliRegistry(
  config: JinnConfig,
  buildImpls: typeof buildHarnesses = buildHarnesses,
): HarnessRegistry {
  const registry = new HarnessRegistry({
    bySolverType: resolveEffectiveBySolverType(config),
    default: config.harnesses?.default ?? DEFAULT_HARNESS,
    disabled: resolveEffectiveDisabled(config),
  });

  // `implStateDirRoot` matches daemon/doctor construction; stub `isReady()` is
  // not HL disk-sensitive today, but the path is consistent if that changes.
  for (const impl of buildImpls({
    stub: true,
    rpcUrl: config.rpcUrl,
    archiveRpcUrl: config.archiveRpcUrl,
    claudePath: config.claudePath,
    claudeModel: config.claudeModel,
    implStateDirRoot: config.engine.implStateDirRoot,
  })) {
    registry.register(impl);
  }

  return registry;
}

/**
 * Resolve the effective disabled list, applying the ship-default plus any
 * operator overrides. Semantics match main.ts: user config fully replaces
 * the default, so operators who have already curated a list aren't
 * surprised by new defaults sneaking in.
 */
export function resolveEffectiveDisabled(config: JinnConfig): string[] {
  const userDisabled = config.harnesses?.disabled;
  if (userDisabled !== undefined) return [...userDisabled];
  return [...DEFAULT_DISABLED_IMPLS];
}

/** Resolve effective kind → impl mapping, applying operator overrides over ship defaults. */
export function resolveEffectiveBySolverType(config: JinnConfig): Record<string, string> {
  return {
    ...DEFAULT_BY_SOLVER_TYPE,
    ...(config.harnesses?.bySolverType ?? {}),
  };
}

/** Is an impl currently disabled in the effective config? */
export function isImplDisabled(implName: string, config: JinnConfig): boolean {
  return resolveEffectiveDisabled(config).includes(implName);
}

interface HarnessesPatch {
  bySolverType?: Record<string, string>;
  default?: string;
  disabled?: string[];
}

/**
 * Patch the user's config file to add/remove an impl from the `harnesses.disabled[]`
 * list.
 *
 * Semantics (important): since user config fully replaces the default list,
 * we always rebuild `disabled` from `DEFAULT_DISABLED_IMPLS ∪ user additions`
 * minus the currently-enabled impl, not from whatever list the user last
 * wrote. Concretely: if we later add a new default-disabled impl, an operator
 * who previously enabled X won't silently auto-enable the new one — their
 * written list always reflects "every current default off, minus what I've
 * explicitly enabled." Extra operator-added disables are preserved verbatim.
 *
 * Returns the new disabled list for the caller to surface.
 */
export function setImplEnabledInConfig(
  implName: string,
  enabled: boolean,
  configPath: string = DEFAULT_CONFIG_PATH,
): string[] {
  let current: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      current = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const harnesses = (current['harnesses'] ?? {}) as HarnessesPatch;
  const existing = new Set(harnesses.disabled ?? []);
  // Operator-added extras: anything they've explicitly disabled that isn't a ship default.
  const defaults = new Set(DEFAULT_DISABLED_IMPLS as readonly string[]);
  const operatorExtras = new Set(
    [...existing].filter((n) => !defaults.has(n)),
  );

  // Rebuild from first principles so future default additions stay disabled
  // unless the operator explicitly enables them too.
  const rebuilt = new Set<string>([...defaults, ...operatorExtras]);

  if (enabled) {
    rebuilt.delete(implName);
  } else {
    rebuilt.add(implName);
  }

  const next = [...rebuilt];
  harnesses.disabled = next;
  current['harnesses'] = harnesses;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n', { encoding: 'utf-8' });

  return next;
}

/** Persist an explicit impl mapping for a specific solverType. */
export function setImplForKindInConfig(
  solverType: string,
  implName: string,
  configPath: string = DEFAULT_CONFIG_PATH,
): void {
  let current: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      current = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const harnesses = (current['harnesses'] ?? {}) as HarnessesPatch;
  harnesses.bySolverType = {
    ...(harnesses.bySolverType ?? {}),
    [solverType]: implName,
  };
  current['harnesses'] = harnesses;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n', { encoding: 'utf-8' });
}

/** Remove an explicit impl mapping for one solverType, reverting to ship default. */
export function resetImplForKindInConfig(
  solverType: string,
  configPath: string = DEFAULT_CONFIG_PATH,
): void {
  let current: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      current = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const harnesses = (current['harnesses'] ?? {}) as HarnessesPatch;
  const bySolverType = { ...(harnesses.bySolverType ?? {}) };
  delete bySolverType[solverType];
  harnesses.bySolverType = bySolverType;
  current['harnesses'] = harnesses;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n', { encoding: 'utf-8' });
}
