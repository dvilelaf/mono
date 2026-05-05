/**
 * `jinn harnesses list|add|remove` — operator-facing CLI for managing
 * config-declared external Harnesses (Path 2 plug-in surface).
 *
 * `add <manifest-uri-or-path>`: verifies the package's `jinn.manifest.json`
 * against the operator's `trustedImplSigners`, and appends an
 * `ExternalImplEntry` to `harnesses.externalImpls` in the config file.
 *
 * `list`: prints the configured entries.
 * `remove <name>`: drops the named entry from the config file.
 *
 * Spec: `spec/2026-04-30-plug-in-surface.md` §3 / plan
 * `docs/superpowers/plans/2026-04-30-plug-in-surface-path-2-foundation.md`
 * task 7.
 */

import { parseArgs } from 'node:util';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import type { CommandContext, CommandModule } from '../command.js';
import { formatRecommendations } from '../../recommendations/format.js';
import {
  loadManifest,
  verifyManifestSignature,
} from '../../harnesses/manifest/index.js';
import { verifyPackageHash } from '../../harnesses/external-impls/package-hash.js';
import {
  computeManifestHash,
  computeTarballHash,
  computeEntryPointHashes,
} from '../../harnesses/manifest/content-hash.js';
import { writeInstalledHarness, readInstalledHarnesses, addBlockedHarness } from '../../installed-records.js';
import { publishAttestation } from '../../network-trust/attestation.js';
import type { PlugInAttestation } from '../../network-trust/schema.js';

const DEFAULT_CONFIG_PATH = join(homedir(), '.jinn-client', 'config.json');

interface ExternalImplEntry {
  name: string;
  entry: string;
  package?: string;
}

interface SignerTrust {
  alg: 'ed25519';
  publicKey: string;
  label?: string;
}

interface ConfigShape {
  harnesses?: { externalImpls?: ExternalImplEntry[]; [k: string]: unknown };
  trustedImplSigners?: SignerTrust[];
  [k: string]: unknown;
}

function readConfigFile(path: string): ConfigShape {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ConfigShape;
  } catch {
    return {};
  }
}

function writeConfigFile(path: string, cfg: ConfigShape): void {
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
// list
// ---------------------------------------------------------------------------

function runList(ctx: CommandContext, configPath: string): void {
  const cfg = readConfigFile(configPath);
  const entries = cfg.harnesses?.externalImpls ?? [];
  emitJson(ctx, { verb: 'harnesses list', configPath, entries });
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

async function runAdd(
  ctx: CommandContext,
  configPath: string,
  pkgPath: string,
  wantPublish: boolean,
): Promise<void> {
  const absPkg = isAbsolute(pkgPath) ? pkgPath : resolve(process.cwd(), pkgPath);
  const manifestPath = join(absPkg, 'jinn.manifest.json');
  if (!existsSync(manifestPath)) {
    emitError(ctx, 'manifest_not_found', `No jinn.manifest.json at ${absPkg}`, {
      packagePath: absPkg,
    });
    return;
  }

  let manifest;
  try {
    manifest = await loadManifest(manifestPath);
  } catch (err) {
    emitError(ctx, 'manifest_invalid', (err as Error).message, {
      manifestPath,
    });
    return;
  }

  const cfg = readConfigFile(configPath);
  const trusted = cfg.trustedImplSigners ?? [];
  const ok = await verifyManifestSignature(manifest, trusted);
  if (!ok) {
    emitError(
      ctx,
      'untrusted_signer',
      `Manifest is not signed by any key in trustedImplSigners. ` +
        `Add the publisher's public key (${manifest.signature.publicKey.slice(0, 20)}…) ` +
        `to trustedImplSigners[] first.`,
      { manifestPublicKey: manifest.signature.publicKey },
    );
    return;
  }

  // Recompute the package-content hash and compare to manifest.package.hash
  // before mutating the operator's config. Catches install-time mismatches
  // (Finding 2) so the daemon never starts with a stale entry.
  const hashOk = await verifyPackageHash(absPkg, manifest);
  if (!hashOk) {
    emitError(
      ctx,
      'package_hash_mismatch',
      `Recomputed package hash does not match manifest.package.hash (${manifest.package.hash}). ` +
        `Re-publish the package or pull the matching tarball.`,
      { manifestHash: manifest.package.hash, packagePath: absPkg },
    );
    return;
  }

  // Record content-hash binding so the runtime loader can detect drift.
  const manifestHash = computeManifestHash(manifest);
  const tarballHash = computeTarballHash(absPkg);
  const entryPointHashes = computeEntryPointHashes(absPkg, [manifest.entry]);
  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME']
    : homedir();
  writeInstalledHarness(home, manifest.name, {
    version: manifest.version,
    manifestHash,
    tarballHash,
    entryPointHashes,
    tier: 1, // v0 default; tier-detection lands in a later phase
    installedAt: new Date().toISOString(),
    publishedAttestation: null,
  });

  const list: ExternalImplEntry[] = [...(cfg.harnesses?.externalImpls ?? [])];
  if (list.some((e) => e.name === manifest.name)) {
    emitError(ctx, 'already_added', `Entry ${manifest.name} already present`, {
      name: manifest.name,
    });
    return;
  }
  list.push({ name: manifest.name, entry: absPkg });
  cfg.harnesses = { ...(cfg.harnesses ?? {}), externalImpls: list };
  writeConfigFile(configPath, cfg);

  // Best-effort attestation publish when --publish or JINN_PUBLISH_INSTALL_ATTESTATIONS.
  if (wantPublish) {
    const attestation: PlugInAttestation = {
      subject: manifest.name,
      subjectType: 'harness',
      version: manifest.version,
      manifestHash,
      tarballHash,
      tier: 1,
      kind: 'installed',
      score: 0,
      reason: '',
      reviewCid: '',
      attestedAt: Math.floor(Date.now() / 1000),
    };
    // Stub clients — publishAttestation is mocked in tests. In production
    // environments the bridge wires to IdentityPublisher (a later integration
    // task). For now we supply null-impl clients that will produce an ok=false
    // result with a clear error so the install still succeeds.
    const ipfsStub = {
      pinJson: async () => { throw new Error('no IPFS client configured for CLI publish'); },
      fetchJson: async () => null,
    };
    const reputationStub = {
      giveFeedback: async () => { throw new Error('no reputation client configured for CLI publish'); },
    };
    const result = await publishAttestation({
      attestation,
      targetAgentId: 0n,
      ipfs: ipfsStub,
      reputation: reputationStub,
    });
    if (result.ok && result.txHash) {
      writeInstalledHarness(home, manifest.name, {
        version: manifest.version,
        manifestHash,
        tarballHash,
        entryPointHashes,
        tier: 1,
        installedAt: new Date().toISOString(),
        publishedAttestation: result.txHash,
      });
    } else {
      process.stderr.write(
        `Warning: attestation publish failed: ${result.error ?? 'unknown error'}\n`,
      );
    }
  }

  emitJson(ctx, {
    verb: 'harnesses add',
    added: { name: manifest.name, entry: absPkg, version: manifest.version },
    configPath,
  });
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

function runRemove(ctx: CommandContext, configPath: string, name: string): void {
  const cfg = readConfigFile(configPath);
  const list = cfg.harnesses?.externalImpls ?? [];
  const idx = list.findIndex((e) => e.name === name);
  if (idx < 0) {
    emitError(ctx, 'not_found', `No external Harness named ${name} in config`, {
      name,
    });
    return;
  }
  const next = list.filter((_, i) => i !== idx);
  cfg.harnesses = { ...(cfg.harnesses ?? {}), externalImpls: next };
  writeConfigFile(configPath, cfg);
  emitJson(ctx, { verb: 'harnesses remove', removed: name, configPath });
}

// ---------------------------------------------------------------------------
// endorse / warn / block / review / feedback
// ---------------------------------------------------------------------------

async function runFeedbackVerb(
  ctx: CommandContext,
  args: { kind: 'endorse' | 'warn' | 'block'; subject: string; reason: string | undefined },
  home: string,
): Promise<void> {
  if ((args.kind === 'warn' || args.kind === 'block') && !args.reason) {
    emitJson(ctx, {
      error: { code: 'invalid_invocation', message: `--reason is required for ${args.kind}` },
    });
    ctx.exit(1);
    return;
  }

  const records = readInstalledHarnesses(home);
  const installed = records[args.subject];
  if (!installed) {
    emitJson(ctx, {
      error: {
        code: 'not_installed',
        message: `${args.subject} is not installed; nothing to attest`,
      },
    });
    ctx.exit(1);
    return;
  }

  const score: -2 | -1 | 0 | 1 =
    args.kind === 'endorse' ? 1 : args.kind === 'warn' ? -1 : -2;

  const attestation: PlugInAttestation = {
    subject: args.subject,
    subjectType: 'harness',
    version: installed.version,
    manifestHash: installed.manifestHash,
    tarballHash: installed.tarballHash,
    tier: installed.tier,
    kind: args.kind,
    score,
    reason: args.reason ?? '',
    reviewCid: '',
    attestedAt: Math.floor(Date.now() / 1000),
  };

  // For block: apply local disable first — this must succeed even if on-chain fails.
  if (args.kind === 'block') {
    addBlockedHarness(home, args.subject);
  }

  const ipfsStub = {
    pinJson: async () => { throw new Error('no IPFS client configured for CLI feedback'); },
    fetchJson: async () => null,
  };
  const reputationStub = {
    giveFeedback: async () => { throw new Error('no reputation client configured for CLI feedback'); },
  };

  const result = await publishAttestation({
    attestation,
    targetAgentId: 0n,
    ipfs: ipfsStub,
    reputation: reputationStub,
  });

  emitJson(ctx, {
    verb: `harnesses ${args.kind}`,
    subject: args.subject,
    kind: args.kind,
    score,
    txHash: result.txHash ?? null,
    cid: result.cid ?? null,
    ok: result.ok,
    publishError: result.ok ? undefined : result.error,
    ...(args.kind === 'block' ? { blocked: args.subject } : {}),
  });
}

async function runEndorse(ctx: CommandContext, rest: string[], home: string): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: { reason: { type: 'string' as const } } });
  } catch (err) {
    emitError(ctx, 'invalid_invocation', (err as Error).message);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) { emitError(ctx, 'invalid_invocation', 'usage: jinn harnesses endorse <name>'); return; }
  await runFeedbackVerb(ctx, { kind: 'endorse', subject, reason: parsed.values.reason }, home);
}

async function runWarn(ctx: CommandContext, rest: string[], home: string): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: { reason: { type: 'string' as const } } });
  } catch (err) {
    emitError(ctx, 'invalid_invocation', (err as Error).message);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) { emitError(ctx, 'invalid_invocation', 'usage: jinn harnesses warn <name>'); return; }
  await runFeedbackVerb(ctx, { kind: 'warn', subject, reason: parsed.values.reason }, home);
}

async function runBlock(ctx: CommandContext, rest: string[], home: string): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: { reason: { type: 'string' as const } } });
  } catch (err) {
    emitError(ctx, 'invalid_invocation', (err as Error).message);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) { emitError(ctx, 'invalid_invocation', 'usage: jinn harnesses block <name>'); return; }
  await runFeedbackVerb(ctx, { kind: 'block', subject, reason: parsed.values.reason }, home);
}

async function runReview(ctx: CommandContext, rest: string[], home: string): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: { 'notes-file': { type: 'string' as const } } });
  } catch (err) {
    emitError(ctx, 'invalid_invocation', (err as Error).message);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) {
    emitError(ctx, 'invalid_invocation', 'usage: jinn harnesses review <name> --notes-file <path>');
    return;
  }
  const notesFile = parsed.values['notes-file'];
  if (!notesFile) {
    emitError(ctx, 'invalid_invocation', '--notes-file is required for review');
    return;
  }
  await runHarnessReviewImpl(ctx, { subject, notesFile }, home);
}

async function runHarnessReviewImpl(
  ctx: CommandContext,
  args: { subject: string; notesFile: string },
  home: string,
): Promise<void> {
  const records = readInstalledHarnesses(home);
  const installed = records[args.subject];
  if (!installed) {
    emitError(ctx, 'not_installed', `${args.subject} is not installed; nothing to attest`);
    return;
  }

  if (!existsSync(args.notesFile)) {
    emitError(ctx, 'not_found', `Notes file not found: ${args.notesFile}`);
    return;
  }

  const notesText = readFileSync(args.notesFile, 'utf8');

  const ipfsStub = {
    pinJson: async (v: unknown) => { void v; throw new Error('no IPFS client configured for CLI review'); },
    fetchJson: async () => null,
    pinText: async (text: string) => { void text; throw new Error('no IPFS client configured for CLI review'); },
  };

  let notesCid = '';
  try {
    notesCid = await ipfsStub.pinText(notesText);
  } catch {
    // best-effort
  }

  const attestation: PlugInAttestation = {
    subject: args.subject,
    subjectType: 'harness',
    version: installed.version,
    manifestHash: installed.manifestHash,
    tarballHash: installed.tarballHash,
    tier: installed.tier,
    kind: 'review',
    score: 0,
    reason: '',
    reviewCid: notesCid,
    attestedAt: Math.floor(Date.now() / 1000),
  };

  const reputationStub = {
    giveFeedback: async () => { throw new Error('no reputation client configured for CLI review'); },
  };

  const result = await publishAttestation({
    attestation,
    targetAgentId: 0n,
    ipfs: ipfsStub,
    reputation: reputationStub,
  });

  emitJson(ctx, {
    verb: 'harnesses review',
    subject: args.subject,
    kind: 'review',
    notesCid,
    txHash: result.txHash ?? null,
    cid: result.cid ?? null,
    ok: result.ok,
    publishError: result.ok ? undefined : result.error,
  });
}

async function runHarnessFeedbackList(ctx: CommandContext, rest: string[], _home: string): Promise<void> {
  // Expects args: ['list', '<subject>', ...options]
  const [sub, subject, ...opts] = rest;
  if (sub !== 'list' || !subject) {
    emitError(ctx, 'invalid_invocation', 'usage: jinn harnesses feedback list <name> [--include-history] [--from <attestor>]');
    return;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: opts,
      allowPositionals: false,
      options: {
        'include-history': { type: 'boolean' as const, default: false },
        from: { type: 'string' as const },
      },
    });
  } catch (err) {
    emitError(ctx, 'invalid_invocation', (err as Error).message);
    return;
  }

  const includeHistory = parsed.values['include-history'] === true;
  const fromFilter = typeof parsed.values['from'] === 'string' ? parsed.values['from'] : undefined;

  const followedAttestors = resolveFollowedAttestorsH(ctx);

  const { createNoOpFeedbackReader, formatFeedbackSummary, groupByKind } =
    await import('../../network-trust/feedback-reader.js');

  const reader = createNoOpFeedbackReader();
  const atts = await reader.fetchAttestations({
    subject,
    followedAttestors: fromFilter ? [fromFilter] : followedAttestors,
    includeHistory,
  });

  const summary = groupByKind(atts, subject);
  const formatted = formatFeedbackSummary(summary);

  emitJson(ctx, {
    verb: 'harnesses feedback list',
    subject,
    followedAttestors,
    attestationCount: atts.length,
    summary: {
      endorsements: summary.endorsements.length,
      warnings: summary.warnings.length,
      blocks: summary.blocks.length,
      reviews: summary.reviews.length,
    },
    attestations: atts,
    note: followedAttestors.length === 0
      ? 'No followedAttestors configured. Set JINN_FOLLOWED_ATTESTORS or config.followedAttestors[].'
      : undefined,
  });
  ctx.writer.write(formatted);
}

function resolveFollowedAttestorsH(ctx: CommandContext): string[] {
  const envVal = ctx.env['JINN_FOLLOWED_ATTESTORS'];
  if (!envVal) return [];
  try {
    const parsed = JSON.parse(envVal) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
  } catch { /* not JSON */ }
  return envVal.split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// recommendations
// ---------------------------------------------------------------------------

async function runRecommendations(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: false,
      options: {
        limit: { type: 'string' as const },
        since: { type: 'string' as const },
      },
    });
  } catch (err) {
    emitError(ctx, 'invalid_invocation', (err as Error).message);
    return;
  }

  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME']
    : homedir();
  const limit = parsed.values.limit !== undefined ? Math.max(1, Number(parsed.values.limit)) : 20;
  const since = typeof parsed.values.since === 'string' ? parsed.values.since : undefined;

  const output = formatRecommendations({
    kind: 'harness',
    addVerb: 'jinn harnesses add',
    home,
    limit,
    since,
  });
  ctx.writer.write(output);
}

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

const HELP_TEXT = `\
jinn harnesses <list|add|remove|recommendations|endorse|warn|block|review|feedback> [options]

Manage operator-supplied external Harnesses (Path 2 plug-in surface).

Subcommands:
  list                   Print configured external Harnesses
  add <pkg-path>         Verify a package's jinn.manifest.json against
                         trustedImplSigners[] and append the entry to
                         harnesses.externalImpls in the config file
  remove <name>          Drop the named entry from the config file
  recommendations        Print Harness packages the learner has recommended
  [--limit <N>]          for operator review (default: 20)
  [--since <iso>]        Filter to recommendations newer than an ISO date
  endorse <name>         Publish an endorse attestation for an installed harness
  warn <name>            Publish a warn attestation (--reason required)
  block <name>           Publish a block attestation + disable locally (--reason required)
  review <name>          Pin notes to IPFS and publish a review attestation
  feedback list <name>   List attestations from followed attestors

Options:
  --config <path>        Path to config file (default: ~/.jinn-client/config.json)
  --publish              Publish install attestation on-chain when adding
  --json                 JSON output (default; only mode currently supported)

Examples:
  jinn harnesses list
  jinn harnesses add ./node_modules/@example/forecaster
  jinn harnesses add ./node_modules/@example/forecaster --publish
  jinn harnesses remove @example/forecaster
  jinn harnesses recommendations
  jinn harnesses recommendations --since 2026-05-01T00:00:00Z
  jinn harnesses endorse @example/forecaster --reason "works well"
  jinn harnesses warn @example/forecaster --reason "subtle crash on edge case"
  jinn harnesses block @example/forecaster --reason "verified malware"
  jinn harnesses feedback list @example/forecaster
`;

async function run(ctx: CommandContext): Promise<void> {
  const sub = ctx.argv[0];
  if (!sub || sub === '--help' || sub === '-h') {
    ctx.writer.write(HELP_TEXT);
    return;
  }

  // Feedback verbs have their own arg shapes (--reason, --notes-file, etc.)
  // and must be dispatched before the common parseArgs that only knows
  // --config, --json, --publish. The raw rest args (everything after the
  // subverb) are passed directly to the verb handler's own parseArgs call.
  const feedbackVerbs = ['endorse', 'warn', 'block', 'review', 'feedback'] as const;
  if ((feedbackVerbs as readonly string[]).includes(sub)) {
    const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
      ? ctx.env['JINN_HOME']
      : homedir();
    // ctx.argv = [subverb, ...rest]; slice(1) gives everything after the subverb.
    const rawRest = ctx.argv.slice(1);
    if (sub === 'endorse') { await runEndorse(ctx, rawRest, home); return; }
    if (sub === 'warn') { await runWarn(ctx, rawRest, home); return; }
    if (sub === 'block') { await runBlock(ctx, rawRest, home); return; }
    if (sub === 'review') { await runReview(ctx, rawRest, home); return; }
    if (sub === 'feedback') { await runHarnessFeedbackList(ctx, rawRest, home); return; }
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: ctx.argv.slice(1),
      options: {
        config: { type: 'string' as const },
        json: { type: 'boolean' as const, default: true },
        publish: { type: 'boolean' as const, default: false },
      },
      allowPositionals: true,
    });
  } catch (err) {
    emitError(ctx, 'invalid_invocation', (err as Error).message);
    return;
  }

  const configPath =
    typeof parsed.values.config === 'string' && parsed.values.config.length > 0
      ? parsed.values.config
      : DEFAULT_CONFIG_PATH;

  const wantPublish =
    parsed.values.publish === true ||
    (typeof ctx.env['JINN_PUBLISH_INSTALL_ATTESTATIONS'] === 'string' &&
      ['1', 'true', 'yes'].includes(
        ctx.env['JINN_PUBLISH_INSTALL_ATTESTATIONS'].toLowerCase(),
      ));

  switch (sub) {
    case 'list':
      runList(ctx, configPath);
      return;
    case 'add': {
      const pkgPath = parsed.positionals[0];
      if (!pkgPath) {
        emitError(ctx, 'invalid_invocation', 'usage: jinn harnesses add <pkg-path>');
        return;
      }
      await runAdd(ctx, configPath, pkgPath, wantPublish);
      return;
    }
    case 'remove': {
      const name = parsed.positionals[0];
      if (!name) {
        emitError(ctx, 'invalid_invocation', 'usage: jinn harnesses remove <name>');
        return;
      }
      runRemove(ctx, configPath, name);
      return;
    }
    case 'recommendations':
      await runRecommendations(ctx, ctx.argv.slice(1));
      return;
    default:
      emitError(
        ctx,
        'invalid_invocation',
        `Unknown harnesses subcommand: ${sub} (expected list|add|remove|recommendations|endorse|warn|block|review|feedback)`,
      );
      return;
  }
}

const command: CommandModule = {
  name: 'harnesses',
  summary: 'Manage operator-supplied external Harnesses',
  helpText: HELP_TEXT,
  run,
};

export default command;
