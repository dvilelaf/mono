/**
 * `jinn create restorer <pkgName>` — scaffolds a working external
 * restorer impl package on disk. After
 *   cd <pkgName> && yarn install && yarn test
 * the package's tests pass against a synthetic RestorationContext.
 *
 * Spec: `spec/2026-04-30-plug-in-surface.md` §3 (acceptance #4),
 * `spec/2026-04-30-plug-in-surface.md` §3.3.1 (forecaster pattern).
 */

import { parseArgs } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandContext, CommandModule } from '../command.js';
import { COMMON_FLAGS } from '../command.js';

/**
 * Resolve the templates directory. During development the file lives
 * at `client/src/cli/commands/create.ts`, so `../../../templates`
 * resolves to `client/templates`. After tsc, it lives at
 * `client/dist/cli/commands/create.js`, so the same offset resolves
 * to `client/dist/templates` — we copy templates into dist on build.
 * For robustness we probe both locations.
 */
function resolveTemplatesRoot(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [
    join(here, '../../../templates/restorer/'), // src/cli/commands -> client/templates
    join(here, '../../templates/restorer/'),    // dist/cli/commands -> client/templates
    join(here, '../../../../templates/restorer/'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fallback: first candidate (will surface a clear ENOENT below).
  return candidates[0];
}

const TEMPLATES_ROOT = resolveTemplatesRoot();

const NETWORK_CHAIN_IDS: Record<string, number> = {
  'base-mainnet': 8453,
  'base-sepolia': 84532,
  sepolia: 11155111,
  'ethereum-mainnet': 1,
};

export type RestorerPattern = 'forecaster';

export interface RunCreateArgs {
  kind: 'restorer';
  pattern: RestorerPattern;
  packageName: string;
  kindString: string;
  network: string;
  outDir: string;
}

interface TemplateFile {
  src: string;
  dst: string;
}

const FORECASTER_FILES: TemplateFile[] = [
  { src: 'package.json.tmpl', dst: 'package.json' },
  { src: 'tsconfig.json.tmpl', dst: 'tsconfig.json' },
  { src: 'jinn.manifest.json.tmpl', dst: 'jinn.manifest.json' },
  { src: 'src/index.ts.tmpl', dst: 'src/index.ts' },
  { src: 'test/unit.test.ts.tmpl', dst: 'test/unit.test.ts' },
  { src: 'README.md.tmpl', dst: 'README.md' },
  { src: 'gitignore.tmpl', dst: '.gitignore' },
];

function templateFiles(pattern: RestorerPattern): TemplateFile[] {
  switch (pattern) {
    case 'forecaster':
      return FORECASTER_FILES;
    default:
      throw new Error(`unsupported pattern: ${pattern as string}`);
  }
}

function substitute(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    String(vars[key] ?? ''),
  );
}

function packageNameSlug(packageName: string): string {
  return packageName.replace(/^@/, '').replace(/[/]/g, '-');
}

export async function runCreate(args: RunCreateArgs): Promise<string> {
  if (args.kind !== 'restorer') {
    throw new Error(`unsupported kind: ${args.kind as string}`);
  }
  const networkChainId = NETWORK_CHAIN_IDS[args.network];
  if (networkChainId === undefined) {
    throw new Error(
      `unknown network ${args.network}; known: ${Object.keys(NETWORK_CHAIN_IDS).join(', ')}`,
    );
  }
  const targetRoot = join(args.outDir, args.packageName);
  const vars: Record<string, string | number> = {
    packageName: args.packageName,
    packageNameSlug: packageNameSlug(args.packageName),
    kindString: args.kindString,
    network: args.network,
    networkChainId,
  };

  for (const file of templateFiles(args.pattern)) {
    const srcPath = join(TEMPLATES_ROOT, args.pattern, file.src);
    const dstPath = join(targetRoot, file.dst);
    const text = readFileSync(srcPath, 'utf8');
    mkdirSync(dirname(dstPath), { recursive: true });
    writeFileSync(dstPath, substitute(text, vars));
  }
  return targetRoot;
}

const HELP_TEXT = `\
jinn create restorer <packageName>

Scaffold a new external Jinn restorer impl package.

Options:
  --pattern=<pattern>     Template pattern (default: forecaster)
                          Supported: forecaster
  --kind=<kindString>     Intent kind the impl handles (default: prediction.v0)
  --network=<network>     Default network (default: base-sepolia)
                          One of: base-mainnet, base-sepolia, sepolia, ethereum-mainnet
  --out-dir=<path>        Where to write the package (default: cwd)
  --help                  Show this help

Examples:
  jinn create restorer @example/forecaster
  jinn create restorer @example/eval --pattern=forecaster --kind=prediction.v0
  jinn create restorer @example/x --network=base-mainnet
`;

async function run(ctx: CommandContext): Promise<void> {
  // Manual parsing — we want positional: subcommand + packageName.
  const sub = ctx.argv[0];
  if (!sub || sub === '--help' || ctx.argv.includes('--help')) {
    ctx.writer.write(HELP_TEXT);
    return;
  }
  if (sub !== 'restorer') {
    ctx.writer.write(`error: unknown subcommand '${sub}' (expected 'restorer')\n`);
    ctx.writer.write(HELP_TEXT);
    ctx.exit(1);
    return;
  }
  const packageName = ctx.argv[1];
  if (!packageName || packageName.startsWith('--')) {
    ctx.writer.write(`error: package name required\n`);
    ctx.writer.write(HELP_TEXT);
    ctx.exit(1);
    return;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: ctx.argv.slice(2),
      options: {
        ...COMMON_FLAGS,
        pattern: { type: 'string' as const, default: 'forecaster' },
        kind: { type: 'string' as const, default: 'prediction.v0' },
        network: { type: 'string' as const, default: 'base-sepolia' },
        'out-dir': { type: 'string' as const },
      },
      allowPositionals: false,
    });
  } catch (err) {
    ctx.writer.write(`error: ${(err as Error).message}\n`);
    ctx.exit(1);
    return;
  }
  const flags = parsed.values;
  const pattern = String(flags.pattern ?? 'forecaster') as RestorerPattern;
  if (pattern !== 'forecaster') {
    ctx.writer.write(`error: unsupported --pattern '${pattern}' (only 'forecaster' is supported)\n`);
    ctx.exit(1);
    return;
  }
  const outDir = String(flags['out-dir'] ?? process.cwd());

  let target: string;
  try {
    target = await runCreate({
      kind: 'restorer',
      pattern,
      packageName,
      kindString: String(flags.kind ?? 'prediction.v0'),
      network: String(flags.network ?? 'base-sepolia'),
      outDir,
    });
  } catch (err) {
    ctx.writer.write(`error: ${(err as Error).message}\n`);
    ctx.exit(1);
    return;
  }
  ctx.writer.write(
    `Created ${packageName} at ${target}\nNext: cd ${target} && yarn install && yarn test\n`,
  );
}

export const createCommand: CommandModule = {
  name: 'create',
  summary: 'Scaffold a new Jinn external restorer impl package',
  helpText: HELP_TEXT,
  run,
};

export default createCommand;
