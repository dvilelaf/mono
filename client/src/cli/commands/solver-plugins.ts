/**
 * `jinn solver-plugins show|validate|pack|add` — author/curator tooling.
 *
 * These commands inspect SolverPlugin packages. They do not activate plugins;
 * operators attach plugins to SolverNets with `jinn solver-nets add-plugin`.
 *
 * `add <path>` records content-hash binding at install time so the runtime
 * loader can refuse a package whose on-disk content has changed since approval.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import type { CommandContext, CommandModule } from '../command.js';
import { digestDirectory, loadSolverPluginManifest, resolveSolverPlugin } from '../../plugins/index.js';
import {
  computeManifestHash,
  computeTarballHash,
  computeEntryPointHashes,
} from '../../harnesses/manifest/content-hash.js';
import { writeInstalledPlugIn } from '../../installed-records.js';
import { formatRecommendations } from '../../recommendations/format.js';

function writeJson(ctx: CommandContext, value: unknown): void {
  ctx.writer.write(JSON.stringify(value) + '\n');
}

function localRoot(target: string): string {
  const stripped = target.startsWith('file:') || target.startsWith('path:')
    ? target.slice(target.indexOf(':') + 1)
    : target;
  return isAbsolute(stripped) ? stripped : resolve(process.cwd(), stripped);
}

async function show(ctx: CommandContext, rest: string[]): Promise<void> {
  const target = rest.find((arg) => !arg.startsWith('--'));
  if (!target) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins show requires <source-or-path>' } });
    ctx.exit(1);
    return;
  }
  try {
    const plugin = await resolveSolverPlugin(target);
    writeJson(ctx, {
      verb: 'solver-plugins show',
      plugin: {
        name: plugin.name,
        version: plugin.version,
        solverType: plugin.solverType,
        supports: plugin.supports,
        source: plugin.source,
        sourceKind: plugin.sourceKind,
        root: plugin.root,
        manifestPath: plugin.manifestPath,
        sha256: plugin.sha256,
        jinn: plugin.manifest.jinn,
      },
    });
  } catch (err) {
    writeJson(ctx, {
      error: {
        code: 'invalid_solver_plugin',
        message: err instanceof Error ? err.message : String(err),
      },
    });
    ctx.exit(1);
  }
}

async function validate(ctx: CommandContext, rest: string[]): Promise<void> {
  const target = rest.find((arg) => !arg.startsWith('--'));
  if (!target) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins validate requires <source-or-path>' } });
    ctx.exit(1);
    return;
  }
  try {
    const plugin = await resolveSolverPlugin(target);
    writeJson(ctx, {
      verb: 'solver-plugins validate',
      ok: true,
      plugin: {
        name: plugin.name,
        version: plugin.version,
        solverType: plugin.solverType,
        supports: plugin.supports,
        sha256: plugin.sha256,
        manifestPath: plugin.manifestPath,
      },
    });
  } catch (err) {
    writeJson(ctx, {
      verb: 'solver-plugins validate',
      ok: false,
      error: {
        code: 'invalid_solver_plugin',
        message: err instanceof Error ? err.message : String(err),
      },
    });
    ctx.exit(1);
  }
}

async function add(ctx: CommandContext, rest: string[]): Promise<void> {
  const target = rest.find((arg) => !arg.startsWith('--'));
  if (!target) {
    writeJson(ctx, {
      error: { code: 'invalid_invocation', message: 'solver-plugins add requires <path>' },
    });
    ctx.exit(1);
    return;
  }
  const root = localRoot(target);
  if (!existsSync(root)) {
    writeJson(ctx, {
      error: { code: 'not_found', message: `SolverPlugin path not found: ${root}` },
    });
    ctx.exit(1);
    return;
  }
  try {
    const { manifest } = loadSolverPluginManifest(root);
    const manifestHash = computeManifestHash(manifest);
    const tarballHash = computeTarballHash(root);
    // Use jinn.skills as the declared entry-point files; fall back to empty.
    const skills: string[] = manifest.jinn.skills ?? [];
    const entryPointHashes = computeEntryPointHashes(root, skills);
    const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
      ? ctx.env['JINN_HOME']
      : homedir();
    writeInstalledPlugIn(home, manifest.name, {
      version: manifest.version,
      manifestHash,
      tarballHash,
      entryPointHashes,
      tier: 1, // v0 default; tier-detection lands in a later phase
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });
    writeJson(ctx, {
      verb: 'solver-plugins add',
      added: {
        name: manifest.name,
        version: manifest.version,
        manifestHash,
        tarballHash,
        entryPointCount: skills.length,
      },
    });
  } catch (err) {
    writeJson(ctx, {
      error: {
        code: 'invalid_solver_plugin',
        message: err instanceof Error ? err.message : String(err),
      },
    });
    ctx.exit(1);
  }
}

async function pack(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        out: { type: 'string' },
      },
    });
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }
  const target = parsed.positionals[0];
  if (!target) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins pack requires <path>' } });
    ctx.exit(1);
    return;
  }
  const root = localRoot(target);
  if (!existsSync(root)) {
    writeJson(ctx, { error: { code: 'not_found', message: `SolverPlugin path not found: ${root}` } });
    ctx.exit(1);
    return;
  }
  try {
    const { path: manifestPath, manifest } = loadSolverPluginManifest(root);
    const sha256 = digestDirectory(root);
    const out = parsed.values.out
      ? resolve(process.cwd(), String(parsed.values.out))
      : resolve(process.cwd(), `${manifest.name}-${manifest.version}.tgz`);
    mkdirSync(dirname(out), { recursive: true });
    const tar = spawnSync('tar', ['-czf', out, '-C', dirname(root), basename(root)], { encoding: 'utf8' });
    if (tar.status !== 0) {
      throw new Error(tar.stderr || `tar exited ${tar.status}`);
    }
    writeJson(ctx, {
      verb: 'solver-plugins pack',
      packagePath: out,
      plugin: {
        name: manifest.name,
        version: manifest.version,
        supports: manifest.jinn.supports,
        manifestPath,
        sha256,
      },
    });
  } catch (err) {
    writeJson(ctx, {
      error: {
        code: 'invalid_solver_plugin',
        message: err instanceof Error ? err.message : String(err),
      },
    });
    ctx.exit(1);
  }
}

async function recommendations(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: false,
      options: {
        limit: { type: 'string' },
        since: { type: 'string' },
      },
    });
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }

  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME']
    : homedir();
  const limit = parsed.values.limit !== undefined ? Math.max(1, Number(parsed.values.limit)) : 20;
  const since = typeof parsed.values.since === 'string' ? parsed.values.since : undefined;

  const output = formatRecommendations({
    kind: 'plug-in',
    addVerb: 'jinn solver-plugins add',
    home,
    limit,
    since,
  });
  ctx.writer.write(output);
}

const command: CommandModule = {
  name: 'solver-plugins',
  summary: 'Inspect, validate, pack, and register SolverPlugin packages',
  helpText: `Usage:
  jinn solver-plugins add <path>
  jinn solver-plugins show <source-or-path>
  jinn solver-plugins validate <source-or-path>
  jinn solver-plugins pack <path> [--out <file.tgz>]
  jinn solver-plugins recommendations [--limit <N>] [--since <iso>]

  add <path>         Record content-hash binding for a local SolverPlugin
                     package so the runtime loader can detect changes.
                     Respects JINN_HOME env var (default: ~/.jinn-client).
  recommendations    Print SolverPlugin packages the learner has recommended
                     for operator review. Agents emit recommendations via the
                     recommend_plugin MCP tool; the operator decides to install.

SolverPlugin commands are author and curator tooling. They do not activate a
plugin for runtime use. Attach runtime plugins with:
  jinn solver-nets add-plugin <solver-net> <source>
`,
  async run(ctx) {
    const [subverb, ...rest] = ctx.argv;
    if (!subverb || subverb === '--help' || subverb === '-h') {
      ctx.writer.write(command.helpText + '\n');
      return;
    }
    if (subverb === 'add') return add(ctx, rest);
    if (subverb === 'show') return show(ctx, rest);
    if (subverb === 'validate') return validate(ctx, rest);
    if (subverb === 'pack') return pack(ctx, rest);
    if (subverb === 'recommendations') return recommendations(ctx, rest);
    writeJson(ctx, {
      error: {
        code: 'invalid_invocation',
        message: `Unknown solver-plugins subverb: ${subverb}`,
        expected: 'add|show|validate|pack|recommendations',
      },
    });
    ctx.exit(1);
  },
};

export default command;
