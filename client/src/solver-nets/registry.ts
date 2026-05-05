import { resolveSolverPlugin } from '../plugins/index.js';
import type { SolverPluginEntry } from '../plugins/types.js';
import type { RuntimePlugin } from '../harnesses/types.js';
import { getSolverNetContract, type SolverNetContract } from './contracts.js';

export const JINN_NETWORK_TOOLS_PLUGIN = 'bundled:network-tools' as const;

export type SolverNetOperatorRole = 'solving' | 'evaluating';
export type SolverNetTaskRole = 'restoration' | 'evaluation';

export interface SolverNetConfig {
  enabled: boolean;
  solverType: string;
  /**
   * Non-empty subset of operator roles this SolverNet runs concurrently.
   * Optional only because legacy callers (pre-migration helpers) may omit it;
   * the config loader normalises absence to `['solving']` and migrates any
   * legacy singular `role` to `[role]`.
   */
  roles?: SolverNetOperatorRole[];
  harness: string;
  model?: string;
  plugins: SolverPluginEntry[];
  taskGenerator: { enabled: boolean };
}

export interface LoadedSolverNet {
  name: string;
  enabled: boolean;
  solverType: string;
  /** Active operator roles (non-empty after load). */
  roles: SolverNetOperatorRole[];
  contract: SolverNetContract;
  harness: string;
  model?: string;
  runtimePlugins: RuntimePlugin[];
  taskGenerator: { enabled: boolean };
}

function taskRoleForOperatorRole(role: SolverNetOperatorRole): SolverNetTaskRole {
  return role === 'evaluating' ? 'evaluation' : 'restoration';
}

/**
 * Resolve a non-empty roles array from a config entry. Falls back to
 * `['solving']` for shapes that omit `roles` entirely (e.g. a stub used by
 * unit tests or a legacy migration helper that hasn't run through the zod
 * preprocessor). Deduplicates to keep set semantics simple.
 */
function rolesFromConfig(net: SolverNetConfig): SolverNetOperatorRole[] {
  if (net.roles && net.roles.length > 0) return Array.from(new Set(net.roles));
  return ['solving'];
}

function runtimePluginFrom(
  plugin: Awaited<ReturnType<typeof resolveSolverPlugin>>,
  provenance: RuntimePlugin['provenance'],
): RuntimePlugin {
  return {
    name: plugin.name,
    version: plugin.version,
    source: plugin.source,
    sourceKind: plugin.sourceKind,
    solverType: plugin.solverType,
    supports: plugin.supports,
    root: plugin.root,
    manifestPath: plugin.manifestPath,
    sha256: plugin.sha256,
    ...(plugin.cid ? { cid: plugin.cid } : {}),
    provenance,
  };
}

/**
 * A runtime plugin (e.g. Network Tools) declares `supports: ['jinn.runtime']` —
 * it isn't tied to a SolverType, so the supports-includes-solverType check
 * does not apply to it. The manifest validator enforces that no plugin mixes
 * 'jinn.runtime' with SolverType identifiers, so this check cannot be abused
 * by a SolverType plugin claiming runtime status.
 */
function isRuntimePlugin(plugin: Awaited<ReturnType<typeof resolveSolverPlugin>>): boolean {
  return plugin.supports.includes('jinn.runtime');
}

export class SolverNetRegistry {
  private readonly nets = new Map<string, LoadedSolverNet>();

  register(net: LoadedSolverNet): void {
    this.nets.set(net.name, net);
  }

  get(name: string): LoadedSolverNet | undefined {
    return this.nets.get(name);
  }

  forSolverType(solverType: string, taskRole?: SolverNetTaskRole): LoadedSolverNet | undefined {
    return [...this.nets.values()].find((net) =>
      net.enabled &&
      net.solverType === solverType &&
      (taskRole === undefined ||
        net.roles.some((r) => taskRoleForOperatorRole(r) === taskRole)),
    );
  }

  list(): LoadedSolverNet[] {
    return [...this.nets.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  harnessSelections(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const net of this.nets.values()) {
      if (net.enabled) out[net.solverType] = net.harness;
    }
    return out;
  }

  claudeModelSelections(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const net of this.nets.values()) {
      if (net.enabled && net.model) out[net.solverType] = net.model;
    }
    return out;
  }
}

export async function loadSolverNets(
  config: { solverNets: Record<string, SolverNetConfig> },
): Promise<SolverNetRegistry> {
  const registry = new SolverNetRegistry();
  for (const [name, net] of Object.entries(config.solverNets)) {
    if (!net.enabled) continue;
    const contract = getSolverNetContract(net.solverType);
    if (!contract) {
      throw new Error(`SolverNet ${name} has no registered SolverNetContract for ${net.solverType}`);
    }
    const runtimePlugins: RuntimePlugin[] = [];
    const seenSources = new Set<string>();
    const seenNames = new Set<string>();

    async function addRuntimePlugin(
      entry: SolverPluginEntry,
      provenance: RuntimePlugin['provenance'],
    ): Promise<void> {
      const plugin = await resolveSolverPlugin(entry);
      if (seenSources.has(plugin.source) || seenNames.has(plugin.name)) return;
      if (!isRuntimePlugin(plugin) && !plugin.supports.includes(net.solverType)) {
        throw new Error(
          `SolverNet ${name} runtime plugin ${plugin.name} solverType mismatch: config=${net.solverType} plugin supports=${plugin.supports.join(',')}`,
        );
      }
      runtimePlugins.push(runtimePluginFrom(plugin, provenance));
      seenSources.add(plugin.source);
      seenNames.add(plugin.name);
    }

    for (const entry of [JINN_NETWORK_TOOLS_PLUGIN, ...contract.defaultRuntimePlugins]) {
      await addRuntimePlugin(entry, 'default');
    }
    for (const entry of net.plugins ?? []) {
      await addRuntimePlugin(entry, 'configured');
    }
    registry.register({
      name,
      enabled: net.enabled,
      solverType: net.solverType,
      roles: rolesFromConfig(net),
      contract,
      harness: net.harness,
      ...(net.model ? { model: net.model } : {}),
      runtimePlugins,
      taskGenerator: net.taskGenerator,
    });
  }
  return registry;
}
