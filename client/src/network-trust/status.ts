/**
 * Pure status logic for `jinn solver-plugins status` /
 * `jinn harnesses status`.
 *
 * Cross-checks locally installed plug-ins / harnesses against the current
 * verdicts from followed attestors. Returns a `StatusEntry[]` that the CLI
 * verb renders.
 *
 * This module has no CLI or RPC dependencies — it is fully testable by
 * injecting fixture data.
 *
 * Spec: spec/2026-05-05-plug-in-and-harness-network-trust.md §8.4
 */

import type { AttestationWithAttestor } from './most-recent-wins.js';
import type { InstalledRecord } from '../installed-records.js';
import { resolveCurrentVerdict } from './most-recent-wins.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatusWarning {
  attestor: string;
  reason: string;
  ts: number;
}

export interface StatusEntry {
  pkg: string;
  subjectType: 'plug-in' | 'harness';
  installed: InstalledRecord;
  endorseCount: number;
  warnings: StatusWarning[];
  blocks: StatusWarning[];
  recommendation: 'ok' | 'review' | 'disable';
}

// ── Status computation ────────────────────────────────────────────────────────

/**
 * For each installed package, filter attestations to the installed version,
 * apply most-recent-wins resolution, and produce a `StatusEntry`.
 *
 * Recommendation:
 *  - 'disable' if any block attestation.
 *  - 'review'  if any warn attestation (no blocks).
 *  - 'ok'      otherwise.
 */
export function computeStatus(
  installed: Record<string, InstalledRecord>,
  attestations: AttestationWithAttestor[],
  subjectType: 'plug-in' | 'harness',
): StatusEntry[] {
  const entries: StatusEntry[] = [];

  for (const [pkg, record] of Object.entries(installed)) {
    // Filter to attestations relevant to this package at its installed version.
    const relevant = attestations.filter(
      (a) =>
        a.subject === pkg &&
        a.subjectType === subjectType &&
        a.version === record.version,
    );

    // Apply most-recent-wins per (attestor, subject, version).
    const resolved = resolveCurrentVerdict(relevant);

    const endorsements = resolved.filter((a) => a.kind === 'endorse');
    const warnings = resolved.filter((a) => a.kind === 'warn');
    const blocks = resolved.filter((a) => a.kind === 'block');

    let recommendation: 'ok' | 'review' | 'disable';
    if (blocks.length > 0) {
      recommendation = 'disable';
    } else if (warnings.length > 0) {
      recommendation = 'review';
    } else {
      recommendation = 'ok';
    }

    entries.push({
      pkg,
      subjectType,
      installed: record,
      endorseCount: endorsements.length,
      warnings: warnings.map((a) => ({ attestor: a.attestor, reason: a.reason, ts: a.attestedAt })),
      blocks: blocks.map((a) => ({ attestor: a.attestor, reason: a.reason, ts: a.attestedAt })),
      recommendation,
    });
  }

  // Sort: blocks first, then warnings, then ok; within each tier by pkg name.
  const order = { disable: 0, review: 1, ok: 2 };
  entries.sort((a, b) => {
    const rankDiff = order[a.recommendation] - order[b.recommendation];
    if (rankDiff !== 0) return rankDiff;
    return a.pkg.localeCompare(b.pkg);
  });

  return entries;
}

// ── Formatting ────────────────────────────────────────────────────────────────

const ICON = {
  ok: '[ok]',
  review: '[warn]',
  disable: '[block]',
} as const;

/**
 * Pretty-print `StatusEntry[]` for terminal output.
 *
 * Example:
 *
 *   [block] @bad/pkg@0.0.1
 *     Blocked by: 0xAttestor (reason)
 *     Suggested: jinn solver-plugins block @bad/pkg --reason "..."
 *
 *   [warn] @questionable/typo@0.0.1
 *     Warned by: 0xAttestor (reason)
 *     Suggested: jinn solver-plugins warn @questionable/typo --reason "..."
 *
 *   [ok] @good/pkg@1.0.0 — 2 endorsements
 */
export function formatStatus(entries: StatusEntry[], subjectType?: 'plug-in' | 'harness'): string {
  if (entries.length === 0) {
    return 'No installed plug-ins or harnesses to report.\n';
  }

  const addVerb = (entry: StatusEntry): string =>
    entry.subjectType === 'plug-in'
      ? 'jinn solver-plugins'
      : 'jinn harnesses';

  const lines: string[] = [];

  for (const entry of entries) {
    const icon = ICON[entry.recommendation];
    lines.push(`${icon} ${entry.pkg}@${entry.installed.version}`);

    if (entry.blocks.length > 0) {
      for (const b of entry.blocks) {
        const reason = b.reason ? ` — "${b.reason}"` : '';
        lines.push(`  Blocked by: ${b.attestor}${reason}`);
      }
      lines.push(`  Suggested: ${addVerb(entry)} block ${entry.pkg} --reason "follow-up"`);
    }

    if (entry.warnings.length > 0) {
      for (const w of entry.warnings) {
        const reason = w.reason ? ` — "${w.reason}"` : '';
        lines.push(`  Warned by: ${w.attestor}${reason}`);
      }
      if (entry.recommendation === 'review') {
        lines.push(`  Suggested: review with ${addVerb(entry)} review ${entry.pkg} --notes-file <path>`);
      }
    }

    if (entry.recommendation === 'ok' && entry.endorseCount > 0) {
      lines.push(`  ${entry.endorseCount} endorsement${entry.endorseCount === 1 ? '' : 's'} from followed attestors`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
