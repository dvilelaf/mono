/**
 * Pure ranking + formatting logic for `jinn solver-plugins discover` /
 * `jinn harnesses discover`.
 *
 * This module has no CLI or RPC dependencies — it operates on a flat list of
 * `AttestationWithAttestor` records (from the `AttestationFeedbackReader`) and
 * produces ranked `DiscoveryEntry[]` suitable for rendering.
 *
 * Spec: spec/2026-05-05-plug-in-and-harness-network-trust.md §8.4
 */

import type { AttestationWithAttestor } from './most-recent-wins.js';
import { resolveCurrentVerdict } from './most-recent-wins.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveryVersionEntry {
  version: string;
  endorseCount: number;
  installedCount: number;
  reviewCount: number;
  warnCount: number;
  blockCount: number;
  mostRecentAttestedAt: number;
}

export interface DiscoveryEntry {
  subject: string;
  subjectType: 'plug-in' | 'harness';
  versions: DiscoveryVersionEntry[];
}

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * Collapse a flat list of attestations into ranked `DiscoveryEntry[]`.
 *
 * Steps:
 *  1. Apply filter (subjectType, subject).
 *  2. Apply most-recent-wins resolution per (attestor, subject, version).
 *  3. Group by (subject, subjectType) → versions[].
 *  4. Count by kind per version.
 *  5. Sort: by (endorseCount - blockCount*2 - warnCount) desc, then by
 *     mostRecentAttestedAt desc.
 */
export function rankDiscovery(
  atts: AttestationWithAttestor[],
  filter?: { subjectType?: 'plug-in' | 'harness'; subject?: string },
): DiscoveryEntry[] {
  // 1. Filter.
  let filtered = atts;
  if (filter?.subjectType !== undefined) {
    filtered = filtered.filter((a) => a.subjectType === filter.subjectType);
  }
  if (filter?.subject !== undefined) {
    filtered = filtered.filter((a) => a.subject === filter.subject);
  }

  // 2. Apply most-recent-wins per (attestor, subject, version).
  const resolved = resolveCurrentVerdict(filtered);

  // 3. Group by (subject, subjectType) → (version → counts).
  type VersionAcc = {
    endorseCount: number;
    installedCount: number;
    reviewCount: number;
    warnCount: number;
    blockCount: number;
    mostRecentAttestedAt: number;
  };
  type SubjectAcc = {
    subjectType: 'plug-in' | 'harness';
    versions: Map<string, VersionAcc>;
  };

  const bySubject = new Map<string, SubjectAcc>();

  for (const att of resolved) {
    let subjectEntry = bySubject.get(att.subject);
    if (!subjectEntry) {
      subjectEntry = { subjectType: att.subjectType, versions: new Map() };
      bySubject.set(att.subject, subjectEntry);
    }

    let versionEntry = subjectEntry.versions.get(att.version);
    if (!versionEntry) {
      versionEntry = {
        endorseCount: 0,
        installedCount: 0,
        reviewCount: 0,
        warnCount: 0,
        blockCount: 0,
        mostRecentAttestedAt: 0,
      };
      subjectEntry.versions.set(att.version, versionEntry);
    }

    // 4. Count by kind.
    if (att.kind === 'endorse') versionEntry.endorseCount++;
    else if (att.kind === 'installed') versionEntry.installedCount++;
    else if (att.kind === 'review') versionEntry.reviewCount++;
    else if (att.kind === 'warn') versionEntry.warnCount++;
    else if (att.kind === 'block') versionEntry.blockCount++;

    if (att.attestedAt > versionEntry.mostRecentAttestedAt) {
      versionEntry.mostRecentAttestedAt = att.attestedAt;
    }
  }

  // Build entries.
  const entries: DiscoveryEntry[] = [];
  for (const [subject, subjectAcc] of bySubject) {
    const versions: DiscoveryVersionEntry[] = [];
    for (const [version, v] of subjectAcc.versions) {
      versions.push({ version, ...v });
    }
    // Sort versions by score desc, then by mostRecentAttestedAt desc.
    versions.sort((a, b) => {
      const scoreA = a.endorseCount - a.blockCount * 2 - a.warnCount;
      const scoreB = b.endorseCount - b.blockCount * 2 - b.warnCount;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.mostRecentAttestedAt - a.mostRecentAttestedAt;
    });
    entries.push({ subject, subjectType: subjectAcc.subjectType, versions });
  }

  // 5. Sort entries by the best-version score desc, then by mostRecentAttestedAt desc.
  entries.sort((a, b) => {
    const topA = a.versions[0];
    const topB = b.versions[0];
    const scoreA = topA ? topA.endorseCount - topA.blockCount * 2 - topA.warnCount : 0;
    const scoreB = topB ? topB.endorseCount - topB.blockCount * 2 - topB.warnCount : 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const tsA = topA?.mostRecentAttestedAt ?? 0;
    const tsB = topB?.mostRecentAttestedAt ?? 0;
    return tsB - tsA;
  });

  return entries;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Pretty-print `DiscoveryEntry[]` for terminal output.
 *
 * Example output:
 *
 *   @foo/bar@1.2.3 (plug-in)
 *     Endorsements:     7 from followed attestors
 *     Installed by:    12 followed attestors
 *     Warnings:         1 from followed attestors
 *     Add: jinn solver-plugins add @foo/bar
 *
 * Entries with negative net score are annotated "(not recommended)".
 * --limit caps the number of entries shown.
 */
export function formatDiscovery(
  entries: DiscoveryEntry[],
  opts?: { limit?: number },
): string {
  const limit = opts?.limit ?? 20;
  const shown = entries.slice(0, limit);

  if (shown.length === 0) {
    return 'No plug-ins or harnesses discovered from followed attestors.\n';
  }

  const lines: string[] = [];

  for (const entry of shown) {
    const top = entry.versions[0];
    if (!top) continue;

    const netScore = top.endorseCount - top.blockCount * 2 - top.warnCount;
    const notRecommended = netScore < 0 ? ' (not recommended)' : '';
    const addVerb =
      entry.subjectType === 'plug-in'
        ? 'jinn solver-plugins add'
        : 'jinn harnesses add';

    lines.push(`${entry.subject}@${top.version} (${entry.subjectType})${notRecommended}`);

    if (top.endorseCount > 0) {
      lines.push(`  Endorsements:  ${top.endorseCount} from followed attestors`);
    }
    if (top.installedCount > 0) {
      lines.push(`  Installed by:  ${top.installedCount} followed attestors`);
    }
    if (top.reviewCount > 0) {
      lines.push(`  Reviews:       ${top.reviewCount} from followed attestors`);
    }
    if (top.warnCount > 0) {
      lines.push(`  Warnings:      ${top.warnCount} from followed attestors`);
    }
    if (top.blockCount > 0) {
      lines.push(`  Blocks:        ${top.blockCount} from followed attestors`);
    }
    lines.push(`  Add: ${addVerb} ${entry.subject}`);
    lines.push('');
  }

  if (entries.length > limit) {
    lines.push(`... and ${entries.length - limit} more (use --limit to see more)`);
    lines.push('');
  }

  return lines.join('\n');
}
