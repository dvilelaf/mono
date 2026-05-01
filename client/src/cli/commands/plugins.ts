/**
 * `jinn plugins list|add|remove|show` — operator-facing SolverPlugin config.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { CommandContext, CommandModule } from '../command.js';

const DEFAULT_CONFIG_PATH = join(homedir(), '.jinn-client', 'config.json');

type SolverPluginEntry = string | { name?: string; source: string; version?: string };

interface ConfigShape {
  solverPlugins?: SolverPluginEntry[];
  [key: string]: unknown;
}

function configPathFrom(argv: string[]): string {
  const idx = argv.indexOf('--config');
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1]! : DEFAULT_CONFIG_PATH;
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

function entrySource(entry: SolverPluginEntry): string {
  return typeof entry === 'string' ? entry : entry.source;
}

function writeJson(ctx: CommandContext, value: unknown): void {
  ctx.writer.write(JSON.stringify(value) + '\n');
}

const pluginsCommand: CommandModule = {
  name: 'plugins',
  summary: 'Manage configured SolverPlugins',
  helpText: `Usage:
  jinn plugins list [--config <path>]
  jinn plugins add <source> [--name <name>] [--version <version>] [--config <path>]
  jinn plugins remove <source-or-name> [--config <path>]
  jinn plugins show <source-or-name> [--config <path>]

Sources may be bundled:, file:, npm:, git:, github:, or claude: resolver strings.`,

  async run(ctx) {
    const [subverb, ...rest] = ctx.argv;
    const configPath = configPathFrom(ctx.argv);
    const cfg = readConfig(configPath);
    const current = [...(cfg.solverPlugins ?? [])];

    if (!subverb || subverb === 'list') {
      writeJson(ctx, { verb: 'plugins list', configPath, plugins: current });
      return;
    }

    if (subverb === 'add') {
      const parsed = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          config: { type: 'string' },
          name: { type: 'string' },
          version: { type: 'string' },
        },
      });
      const source = parsed.positionals[0];
      if (!source) {
        writeJson(ctx, { error: { code: 'invalid_invocation', message: 'plugins add requires <source>' } });
        ctx.exit(1);
        return;
      }
      if (current.some((entry) => entrySource(entry) === source || (typeof entry !== 'string' && entry.name === parsed.values.name))) {
        writeJson(ctx, { error: { code: 'already_added', message: `SolverPlugin already configured: ${source}` } });
        ctx.exit(1);
        return;
      }
      const nextEntry: SolverPluginEntry =
        parsed.values.name || parsed.values.version
          ? {
              ...(parsed.values.name ? { name: parsed.values.name } : {}),
              source,
              ...(parsed.values.version ? { version: parsed.values.version } : {}),
            }
          : source;
      cfg.solverPlugins = [...current, nextEntry];
      writeConfig(configPath, cfg);
      writeJson(ctx, { verb: 'plugins add', configPath, plugin: nextEntry });
      return;
    }

    if (subverb === 'remove') {
      const target = rest.find((arg) => !arg.startsWith('--'));
      if (!target) {
        writeJson(ctx, { error: { code: 'invalid_invocation', message: 'plugins remove requires <source-or-name>' } });
        ctx.exit(1);
        return;
      }
      const next = current.filter((entry) =>
        typeof entry === 'string'
          ? entry !== target
          : entry.source !== target && entry.name !== target,
      );
      cfg.solverPlugins = next;
      writeConfig(configPath, cfg);
      writeJson(ctx, { verb: 'plugins remove', configPath, removed: current.length - next.length });
      return;
    }

    if (subverb === 'show') {
      const target = rest.find((arg) => !arg.startsWith('--'));
      const plugin = target
        ? current.find((entry) =>
            typeof entry === 'string'
              ? entry === target
              : entry.source === target || entry.name === target,
          )
        : undefined;
      writeJson(ctx, { verb: 'plugins show', configPath, plugin: plugin ?? null });
      return;
    }

    writeJson(ctx, { error: { code: 'invalid_invocation', message: `Unknown plugins subverb: ${subverb}` } });
    ctx.exit(1);
  },
};

export default pluginsCommand;
