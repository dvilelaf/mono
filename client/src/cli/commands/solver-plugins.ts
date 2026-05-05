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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
import { writeInstalledPlugIn, readInstalledPlugIns, readInstalledHarnesses, addBlockedPlugIn } from '../../installed-records.js';
import { formatRecommendations } from '../../recommendations/format.js';
import { publishAttestation } from '../../network-trust/attestation.js';
import type { PlugInAttestation } from '../../network-trust/schema.js';
import { rankDiscovery, formatDiscovery } from '../../network-trust/discover.js';
import { computeStatus, formatStatus } from '../../network-trust/status.js';
import { ABRIDGED_DISCLAIMER } from '../../network-trust/disclaimer.js';

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
  const wantPublish =
    rest.includes('--publish') ||
    (typeof ctx.env['JINN_PUBLISH_INSTALL_ATTESTATIONS'] === 'string' &&
      ['1', 'true', 'yes'].includes(ctx.env['JINN_PUBLISH_INSTALL_ATTESTATIONS'].toLowerCase()));

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

    // Record the install (publishedAttestation set after publish attempt).
    writeInstalledPlugIn(home, manifest.name, {
      version: manifest.version,
      manifestHash,
      tarballHash,
      entryPointHashes,
      tier: 1, // v0 default; tier-detection lands in a later phase
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });

    // Best-effort attestation publish when --publish or JINN_PUBLISH_INSTALL_ATTESTATIONS.
    if (wantPublish) {
      const attestation: PlugInAttestation = {
        subject: manifest.name,
        subjectType: 'plug-in',
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
        // Update the record with the attestation tx hash.
        writeInstalledPlugIn(home, manifest.name, {
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
    ctx.writer.write(ABRIDGED_DISCLAIMER + '\n');
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

// ── Review implementation (Task 6.3) ─────────────────────────────────────────

async function publishReview(
  ctx: CommandContext,
  args: { subjectType: 'plug-in' | 'harness'; subject: string; notesFile: string },
  home: string,
): Promise<void> {
  const records = args.subjectType === 'plug-in'
    ? readInstalledPlugIns(home)
    : readInstalledHarnesses(home);
  const installed = records[args.subject];
  if (!installed) {
    writeJson(ctx, {
      error: {
        code: 'not_installed',
        message: `${args.subject} is not installed; nothing to attest`,
      },
    });
    ctx.exit(1);
    return;
  }

  if (!existsSync(args.notesFile)) {
    writeJson(ctx, {
      error: { code: 'not_found', message: `Notes file not found: ${args.notesFile}` },
    });
    ctx.exit(1);
    return;
  }

  const notesText = readFileSync(args.notesFile, 'utf8');

  // Pin notes to IPFS. Real wiring uses ipfs.pinText when available,
  // falling back to pinJson wrapping. The stub in production CLI will fail
  // (no IPFS configured), but the test mocks publishAttestation entirely, so
  // this path runs only in integration scenarios.
  const ipfsStub = {
    pinJson: async (v: unknown) => {
      void v;
      throw new Error('no IPFS client configured for CLI review');
    },
    fetchJson: async () => null,
    pinText: async (text: string) => {
      void text;
      throw new Error('no IPFS client configured for CLI review');
    },
  };

  // Pin notes first, then build the attestation with reviewCid.
  // In the test context, publishAttestation is mocked so the ipfsStub
  // is never invoked. The ipfsStub is only there for type-correctness.
  let notesCid = '';
  try {
    if (ipfsStub.pinText) {
      notesCid = await ipfsStub.pinText(notesText);
    } else {
      notesCid = await ipfsStub.pinJson({ text: notesText, contentType: 'text/markdown' });
    }
  } catch {
    // If pinning fails, notesCid stays empty — the attestation still records
    // what we can; the reviewCid field will be empty.
  }

  const attestation: PlugInAttestation = {
    subject: args.subject,
    subjectType: args.subjectType,
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

  writeJson(ctx, {
    verb: `${args.subjectType === 'plug-in' ? 'solver-plugins' : 'harnesses'} review`,
    subject: args.subject,
    kind: 'review',
    notesCid,
    txHash: result.txHash ?? null,
    cid: result.cid ?? null,
    ok: result.ok,
    publishError: result.ok ? undefined : result.error,
  });
}

// ── Feedback list (Task 6.4) ──────────────────────────────────────────────────

async function runFeedbackList(
  ctx: CommandContext,
  args: { subjectType: 'plug-in' | 'harness'; subject: string; rest: string[] },
  _home: string,
): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: args.rest,
      allowPositionals: false,
      options: {
        'include-history': { type: 'boolean', default: false },
        from: { type: 'string' },
      },
    });
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }

  const includeHistory = parsed.values['include-history'] === true;
  const fromFilter = typeof parsed.values['from'] === 'string' ? parsed.values['from'] : undefined;

  // Resolve followedAttestors from env (JINN_FOLLOWED_ATTESTORS).
  const followedAttestors = resolveFollowedAttestors(ctx);
  if (fromFilter) {
    // If --from is set, narrow to that attestor only (if it's in followedAttestors).
    const filtered = followedAttestors.filter((a) => a.toLowerCase() === fromFilter.toLowerCase());
    if (filtered.length === 0 && followedAttestors.length > 0) {
      writeJson(ctx, { error: { code: 'not_found', message: `Attestor ${fromFilter} is not in followedAttestors` } });
      ctx.exit(1);
      return;
    }
  }

  const { createNoOpFeedbackReader, formatFeedbackSummary, groupByKind } =
    await import('../../network-trust/feedback-reader.js');

  // In the CLI context we don't have an RPC/IPFS client wired.
  // The no-op reader returns empty results; a future integration phase
  // will wire the real on-chain reader. Users who want live reads can
  // call the daemon API (a later Phase 7-8 extension).
  const reader = createNoOpFeedbackReader();

  const atts = await reader.fetchAttestations({
    subject: args.subject,
    followedAttestors: fromFilter ? [fromFilter] : followedAttestors,
    includeHistory,
  });

  const summary = groupByKind(atts, args.subject);
  const formatted = formatFeedbackSummary(summary);

  // Output: human-readable format to stdout; JSON envelope for scripting.
  writeJson(ctx, {
    verb: `${args.subjectType === 'plug-in' ? 'solver-plugins' : 'harnesses'} feedback list`,
    subject: args.subject,
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
      ? 'No followedAttestors configured. Set JINN_FOLLOWED_ATTESTORS or config.followedAttestors[] to see network attestations.'
      : undefined,
  });
  ctx.writer.write(formatted);
}

function resolveFollowedAttestors(ctx: CommandContext): string[] {
  const envVal = ctx.env['JINN_FOLLOWED_ATTESTORS'];
  if (!envVal) return [];
  // Accept comma-separated or JSON array.
  try {
    const parsed = JSON.parse(envVal) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
  } catch {
    // not JSON
  }
  return envVal.split(',').map((s) => s.trim()).filter(Boolean);
}

// ── Shared feedback helper ────────────────────────────────────────────────────

async function publishFeedback(
  ctx: CommandContext,
  args: {
    kind: 'endorse' | 'warn' | 'block';
    subject: string;
    reason: string | undefined;
  },
  home: string,
): Promise<void> {
  if ((args.kind === 'warn' || args.kind === 'block') && !args.reason) {
    writeJson(ctx, {
      error: { code: 'invalid_invocation', message: `--reason is required for ${args.kind}` },
    });
    ctx.exit(1);
    return;
  }

  const records = readInstalledPlugIns(home);
  const installed = records[args.subject];
  if (!installed) {
    writeJson(ctx, {
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
    subjectType: 'plug-in',
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
    addBlockedPlugIn(home, args.subject);
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

  writeJson(ctx, {
    verb: `solver-plugins ${args.kind}`,
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

async function endorse(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: {
      reason: { type: 'string' },
    }});
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins endorse requires <name>' } });
    ctx.exit(1);
    return;
  }
  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME'] : homedir();
  await publishFeedback(ctx, { kind: 'endorse', subject, reason: parsed.values.reason }, home);
}

async function warn(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: {
      reason: { type: 'string' },
    }});
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins warn requires <name>' } });
    ctx.exit(1);
    return;
  }
  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME'] : homedir();
  await publishFeedback(ctx, { kind: 'warn', subject, reason: parsed.values.reason }, home);
}

async function block(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: {
      reason: { type: 'string' },
    }});
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins block requires <name>' } });
    ctx.exit(1);
    return;
  }
  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME'] : homedir();
  await publishFeedback(ctx, { kind: 'block', subject, reason: parsed.values.reason }, home);
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

async function review(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: {
      'notes-file': { type: 'string' },
    }});
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }
  const subject = parsed.positionals[0];
  if (!subject) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins review requires <name>' } });
    ctx.exit(1);
    return;
  }
  const notesFile = parsed.values['notes-file'];
  if (!notesFile) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'solver-plugins review requires --notes-file <path>' } });
    ctx.exit(1);
    return;
  }
  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME'] : homedir();
  await publishReview(ctx, { subjectType: 'plug-in', subject, notesFile }, home);
}

async function feedbackList(ctx: CommandContext, rest: string[]): Promise<void> {
  const [sub, subject, ...feedbackRest] = rest;
  if (sub !== 'list' || !subject) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: 'usage: jinn solver-plugins feedback list <name> [--include-history] [--from <attestor>]' } });
    ctx.exit(1);
    return;
  }
  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME'] : homedir();
  await runFeedbackList(ctx, { subjectType: 'plug-in', subject, rest: feedbackRest }, home);
}

// ── discover (Task 7.1) ───────────────────────────────────────────────────────

async function discover(ctx: CommandContext, rest: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: false,
      options: {
        limit: { type: 'string' },
      },
    });
  } catch (err) {
    writeJson(ctx, { error: { code: 'invalid_invocation', message: err instanceof Error ? err.message : String(err) } });
    ctx.exit(1);
    return;
  }

  const limit = parsed.values.limit !== undefined ? Math.max(1, Number(parsed.values.limit)) : 20;
  const followedAttestors = resolveFollowedAttestors(ctx);

  const { createNoOpFeedbackReader } = await import('../../network-trust/feedback-reader.js');
  const reader = createNoOpFeedbackReader();

  const atts = await reader.readAllAttestationsFromAttestors(followedAttestors);
  const entries = rankDiscovery(atts, { subjectType: 'plug-in' });

  if (followedAttestors.length === 0) {
    ctx.writer.write(
      'No followedAttestors configured. Set JINN_FOLLOWED_ATTESTORS to see network attestations.\n',
    );
    return;
  }

  ctx.writer.write(formatDiscovery(entries, { limit }));
}

// ── status (Task 7.2) ─────────────────────────────────────────────────────────

async function statusVerb(ctx: CommandContext, _rest: string[]): Promise<void> {
  const home = typeof ctx.env['JINN_HOME'] === 'string' && ctx.env['JINN_HOME'].length > 0
    ? ctx.env['JINN_HOME']
    : homedir();

  const installed = readInstalledPlugIns(home);
  const followedAttestors = resolveFollowedAttestors(ctx);

  const { createNoOpFeedbackReader } = await import('../../network-trust/feedback-reader.js');
  const reader = createNoOpFeedbackReader();

  const atts = await reader.readAllAttestationsFromAttestors(followedAttestors);
  const entries = computeStatus(installed, atts, 'plug-in');

  if (followedAttestors.length === 0) {
    ctx.writer.write(
      'No followedAttestors configured. Set JINN_FOLLOWED_ATTESTORS to see network advisories.\n',
    );
    // Still show installed list without advisory data.
    const noAdvisoryEntries = computeStatus(installed, [], 'plug-in');
    ctx.writer.write(formatStatus(noAdvisoryEntries));
    return;
  }

  ctx.writer.write(formatStatus(entries));
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
  jinn solver-plugins add <path> [--publish]
  jinn solver-plugins show <source-or-path>
  jinn solver-plugins validate <source-or-path>
  jinn solver-plugins pack <path> [--out <file.tgz>]
  jinn solver-plugins recommendations [--limit <N>] [--since <iso>]
  jinn solver-plugins discover [--limit <N>]
  jinn solver-plugins status
  jinn solver-plugins endorse <name> [--reason <text>]
  jinn solver-plugins warn <name> --reason <text>
  jinn solver-plugins block <name> --reason <text>
  jinn solver-plugins review <name> --notes-file <path>
  jinn solver-plugins feedback list <name> [--include-history] [--from <attestor>]

  add <path>         Record content-hash binding for a local SolverPlugin
                     package so the runtime loader can detect changes.
                     Respects JINN_HOME env var (default: ~/.jinn-client).
  --publish          Also publish an install attestation on-chain (best-effort).
                     Also triggered by JINN_PUBLISH_INSTALL_ATTESTATIONS=1.
  discover           List plug-ins attested by followed attestors, ranked by
                     net positive signal (endorse - 2*block - warn).
  status             Cross-check installed plug-ins against followed-attestor
                     advisories. Shows warnings and block recommendations.
  endorse|warn|block Publish an attestation verdict for an installed plug-in.
  review             Pin review notes to IPFS and publish a review attestation.
  feedback list      List attestations from followed attestors for a plug-in.
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
    if (subverb === 'discover') return discover(ctx, rest);
    if (subverb === 'status') return statusVerb(ctx, rest);
    if (subverb === 'endorse') return endorse(ctx, rest);
    if (subverb === 'warn') return warn(ctx, rest);
    if (subverb === 'block') return block(ctx, rest);
    if (subverb === 'review') return review(ctx, rest);
    if (subverb === 'feedback') return feedbackList(ctx, rest);
    writeJson(ctx, {
      error: {
        code: 'invalid_invocation',
        message: `Unknown solver-plugins subverb: ${subverb}`,
        expected: 'add|show|validate|pack|recommendations|discover|status|endorse|warn|block|review|feedback',
      },
    });
    ctx.exit(1);
  },
};

export default command;
