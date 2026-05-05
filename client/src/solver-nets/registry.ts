import { homedir } from 'node:os';
import { resolveSolverPlugin } from '../plugins/index.js';
import type { SolverPluginEntry } from '../plugins/types.js';
import type { RuntimePlugin } from '../harnesses/types.js';
import { getSolverNetContract, type SolverNetContract } from './contracts.js';
import { readInstalledPlugIns } from '../installed-records.js';
import {
  computeManifestHash,
  computeEntryPointHashes,
} from '../harnesses/manifest/content-hash.js';

/**
 * Thrown when a plug-in's on-disk content has changed since its install-time
 * approval. The message includes a re-approval prompt so operators know what
 * to run to unblock.
 */
export class ContentHashError extends Error {
  readonly code = 'content-hash-mismatch' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ContentHashError';
  }
}

export const JINN_NETWORK_TOOLS_PLUGIN = 'bundled:network-tools' as const;

export type SolverNetOperatorRole = 'solving' | 'evaluating';
export type SolverNetTaskRole = 'restoration' | 'evaluation';

export interface SolverNetConfig {
  enabled: boolean;
  solverType: string;
  role?: SolverNetOperatorRole;
  harness: string;
  model?: string;
  plugins: SolverPluginEntry[];
  taskGenerator: { enabled: boolean };
}

export interface LoadedSolverNet {
  name: string;
  enabled: boolean;
  solverType: string;
  role: SolverNetOperatorRole;
  contract: SolverNetContract;
  harness: string;
  model?: string;
  runtimePlugins: RuntimePlugin[];
  taskGenerator: { enabled: boolean };
}

function taskRoleForOperatorRole(role: SolverNetOperatorRole): SolverNetTaskRole {
  return role === 'evaluating' ? 'evaluation' : 'restoration';
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
      (taskRole === undefined || taskRoleForOperatorRole(net.role) === taskRole),
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
  opts: { home?: string } = {},
): Promise<SolverNetRegistry> {
  const home = opts.home ?? homedir();
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

      // Content-hash verification for operator-configured (non-bundled) plug-ins.
      // Bundled plug-ins (provenance === 'default') are part of the daemon
      // distribution and are not operator-installed, so they are exempt.
      if (provenance === 'configured' && plugin.sourceKind !== 'bundled') {
        const records = readInstalledPlugIns(home);
        const expected = records[plugin.name];
        if (!expected) {
          throw new ContentHashError(
            `Plug-in ${plugin.name} has no install record. ` +
            `Run \`jinn solver-plugins add ${plugin.root}\` to register it.`,
          );
        }
        const actualManifestHash = computeManifestHash(plugin.manifest);
        if (actualManifestHash !== expected.manifestHash) {
          throw new ContentHashError(
            `content-hash-mismatch for ${plugin.name}: manifest changed since install. ` +
            `Run \`jinn solver-plugins add ${plugin.root}\` to re-approve.`,
          );
        }
        const skills: string[] = plugin.manifest.jinn.skills ?? [];
        const actualEntryHashes = computeEntryPointHashes(plugin.root, skills);
        for (const [entry, hash] of Object.entries(actualEntryHashes)) {
          if (expected.entryPointHashes[entry] !== hash) {
            throw new ContentHashError(
              `content-hash-mismatch for ${plugin.name}: ${entry} changed since install. ` +
              `Run \`jinn solver-plugins add ${plugin.root}\` to re-approve.`,
            );
          }
        }
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
      role: net.role ?? 'solving',
      contract,
      harness: net.harness,
      ...(net.model ? { model: net.model } : {}),
      runtimePlugins,
      taskGenerator: net.taskGenerator,
    });
  }
  return registry;
}
