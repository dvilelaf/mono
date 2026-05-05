/**
 * Most-recent-wins verdict resolver for plug-in / harness attestations.
 *
 * When an attestor updates their verdict for a (subject, version) pair, the
 * later attestation supersedes the earlier one. This resolver collapses a
 * flat list of `AttestationWithAttestor` records (from IPFS / ERC-8004
 * discovery) into a de-duplicated set — one entry per (attestor, subject,
 * version) key, keeping whichever has the highest `attestedAt` timestamp.
 *
 * Spec: spec/2026-05-05-plug-in-and-harness-network-trust.md §8.3
 */

import type { PlugInAttestation } from './schema.js';

export interface AttestationWithAttestor extends PlugInAttestation {
  /** On-chain address (or off-chain identifier) of the attestor. */
  attestor: string;
}

/**
 * Collapse `atts` to the most-recent attestation per (attestor, subject, version).
 *
 * When two entries share the same key, the one with the larger `attestedAt`
 * value wins. Ties are broken arbitrarily (last-seen in iteration order).
 *
 * @returns A new array — input is not mutated.
 */
export function resolveCurrentVerdict(
  atts: AttestationWithAttestor[],
): AttestationWithAttestor[] {
  const byKey = new Map<string, AttestationWithAttestor>();
  for (const att of atts) {
    const key = `${att.attestor}|${att.subject}|${att.version}`;
    const existing = byKey.get(key);
    if (!existing || att.attestedAt > existing.attestedAt) {
      byKey.set(key, att);
    }
  }
  return [...byKey.values()];
}
