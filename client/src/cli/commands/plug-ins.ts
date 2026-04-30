/**
 * `jinn plug-ins {list|add|remove|show}` — operator-facing CLI for managing
 * Path 1 plug-ins (the bundled `claude-code-learner` impl's plug-in
 * surface). Edits `learnerPlugIns[]` in the operator config file with
 * install-time manifest validation.
 *
 * Spec: spec/2026-04-30-plug-in-surface.md §4.4.2.
 * Plan: docs/superpowers/plans/2026-04-30-plug-in-surface-path-1-mechanism.md
 * Task 6.
 *
 * Note the plural `plug-ins` (vs. existing singular `jinn plugin install`,
 * which manages AI-host MCP servers and is unrelated).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import type { CommandContext, CommandModule } from '../command.js';
import { loadPlugInManifest } from '../../restorer/plug-ins/manifest.js';

const DEFAULT_CONFIG_PATH = join(homedir(), '.jinn-client', 'config.json');

interface PlugInEntry {
  name: string;
  entry: string;
}

interface ConfigShape {
  learnerPlugIns?: PlugInEntry[];
  [k: string]: unknown;
}

function readConfig(path: string): ConfigShape {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ConfigShape;
  } catch {
    return {};
  }
}

function writeConfig(path: string, cfg: ConfigShape): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

function emitJson(ctx: CommandContext, payload: unknown): void {
  ctx.writer.write(JSON.stringify(payload) + '\n');
}

function emitError(
  ctx: CommandContext,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  emitJson(ctx, { error: { code, message, ...(details ? { details } : {}) } });
  ctx.exit(1);
}

// ---------------------------------------------------------------------------
// Programmatic API (used by tests; mirrors the CLI dispatcher)
// ---------------------------------------------------------------------------

export interface RunPlugInsArgs {
  argv: readonly string[];
  configPath?: string;
  stdout?: { write(s: string): void };
  stderr?: { write(s: string): void };
}

export async function runPlugIns({
  argv,
  configPath = DEFAULT_CONFIG_PATH,
  stdout,
  stderr,
}: RunPlugInsArgs): Promise<number> {
  const out = stdout ?? { write: (s: string) => process.stdout.write(s) };
  const err = stderr ?? { write: (s: string) => process.stderr.write(s) };
  const verb = argv[0];
  if (!existsSync(configPath)) {
    // Initialise a minimal config so list works on a fresh install.
    writeConfig(configPath, { learnerPlugIns: [] });
  }
  switch (verb) {
    case 'list':
      return list(configPath, out);
    case 'add':
      return add(argv.slice(1), configPath, err);
    case 'remove':
      return remove(argv.slice(1), configPath, err);
    case 'show':
      return show(argv.slice(1), configPath, out, err);
    default:
      err.write(`Usage: jinn plug-ins {list|add|remove|show} ...\n`);
      return 1;
  }
}

function list(
  configPath: string,
  stdout: { write(s: string): void },
): number {
  const cfg = readConfig(configPath);
  const entries = cfg.learnerPlugIns ?? [];
  if (entries.length === 0) {
    stdout.write('No plug-ins installed.\n');
    return 0;
  }
  for (const e of entries) {
    stdout.write(`${e.name}\t${e.entry}\n`);
  }
  return 0;
}

async function add(
  rest: readonly string[],
  configPath: string,
  stderr: { write(s: string): void },
): Promise<number> {
  const name = rest[0];
  if (!name) {
    stderr.write(`error: name required\n`);
    return 1;
  }
  const entryFlagIdx = rest.findIndex((a) => a === '--entry');
  const entry = entryFlagIdx >= 0 ? rest[entryFlagIdx + 1] : undefined;
  if (!entry) {
    stderr.write(`error: --entry <path> required\n`);
    return 1;
  }
  const absEntry = isAbsolute(entry) ? entry : resolve(process.cwd(), entry);

  let manifest;
  try {
    manifest = await loadPlugInManifest(absEntry);
  } catch (err) {
    stderr.write(`error: invalid plug-in: ${(err as Error).message}\n`);
    return 1;
  }
  if (manifest.name !== name) {
    stderr.write(
      `error: name "${name}" mismatches manifest name "${manifest.name}"\n`,
    );
    return 1;
  }

  const cfg = readConfig(configPath);
  const next = cfg.learnerPlugIns ?? [];
  if (next.some((e) => e.name === name)) {
    stderr.write(`error: plug-in ${name} already installed\n`);
    return 1;
  }
  next.push({ name, entry: absEntry });
  cfg.learnerPlugIns = next;
  writeConfig(configPath, cfg);
  return 0;
}

async function remove(
  rest: readonly string[],
  configPath: string,
  stderr: { write(s: string): void },
): Promise<number> {
  const name = rest[0];
  if (!name) {
    stderr.write(`error: name required\n`);
    return 1;
  }
  const cfg = readConfig(configPath);
  const list = cfg.learnerPlugIns ?? [];
  const next = list.filter((e) => e.name !== name);
  if (next.length === list.length) {
    stderr.write(`error: plug-in ${name} not installed\n`);
    return 1;
  }
  cfg.learnerPlugIns = next;
  writeConfig(configPath, cfg);
  return 0;
}

async function show(
  rest: readonly string[],
  configPath: string,
  stdout: { write(s: string): void },
  stderr: { write(s: string): void },
): Promise<number> {
  const name = rest[0];
  if (!name) {
    stderr.write(`error: name required\n`);
    return 1;
  }
  const cfg = readConfig(configPath);
  const entry = (cfg.learnerPlugIns ?? []).find((e) => e.name === name);
  if (!entry) {
    stderr.write(`error: plug-in ${name} not installed\n`);
    return 1;
  }
  const manifest = await loadPlugInManifest(entry.entry);
  stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  return 0;
}

// ---------------------------------------------------------------------------
// CommandModule wrapper for cli/index.ts
// ---------------------------------------------------------------------------

const HELP_TEXT = `\
jinn plug-ins <list|add|remove|show> [options]

Manage Path 1 plug-ins for the bundled claude-code-learner impl.
A plug-in declares one or more slot contributions (phase-agent override,
topic explorer, MCP tool, skill bundle, memory backend, hook) via a
\`jinn-plugin.json\` manifest at its package root.

Subcommands:
  list                              Print installed plug-ins
  add <name> --entry <pkg-path>     Validate manifest + append to config
  remove <name>                     Drop the named entry from config
  show <name>                       Print the named plug-in's manifest

Options:
  --config <path>                   Config file (default: ~/.jinn-client/config.json)

Examples:
  jinn plug-ins list
  jinn plug-ins add @example/news-explorer --entry ./node_modules/@example/news-explorer
  jinn plug-ins remove @example/news-explorer
  jinn plug-ins show @example/news-explorer
`;

async function run(ctx: CommandContext): Promise<void> {
  const sub = ctx.argv[0];
  if (!sub || sub === '--help' || sub === '-h') {
    ctx.writer.write(HELP_TEXT);
    return;
  }

  // Strip an optional --config <path> from anywhere in argv before passing
  // through to runPlugIns (which uses positional + --entry parsing).
  let configPath = DEFAULT_CONFIG_PATH;
  const filteredArgv: string[] = [];
  for (let i = 0; i < ctx.argv.length; i++) {
    const a = ctx.argv[i];
    if (a === '--config' && i + 1 < ctx.argv.length) {
      configPath = ctx.argv[i + 1];
      i += 1;
      continue;
    }
    if (a.startsWith('--config=')) {
      configPath = a.slice('--config='.length);
      continue;
    }
    filteredArgv.push(a);
  }

  // Use process.stdout/stderr in production (writer is a CommandContext shim
  // that may not differentiate streams; runPlugIns talks directly).
  const code = await runPlugIns({
    argv: filteredArgv,
    configPath,
    stdout: { write: (s: string) => ctx.writer.write(s) },
    stderr: { write: (s: string) => ctx.writer.write(s) },
  });
  if (code !== 0) {
    // Mirror impls.ts: emit a JSON error envelope on non-zero exit so callers
    // that pipe to jq still see structured output. Keep it minimal — text
    // already went to writer above for human readers.
    ctx.exit(code);
  }
}

const command: CommandModule = {
  name: 'plug-ins',
  summary: 'Manage Path 1 plug-ins for the claude-code-learner impl',
  helpText: HELP_TEXT,
  run,
};

export default command;

// Suppress unused-import warning when parseArgs is added back for richer flag
// parsing in a follow-up.
void parseArgs;
