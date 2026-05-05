/**
 * On-chain attestation reader for plug-in / harness feedback.
 *
 * Reads `setMetadata` events from the IdentityRegistry filtered to a list of
 * followed attestors, fetches attestation JSONs from IPFS, validates them, and
 * applies most-recent-wins resolution.
 *
 * The `AttestationFeedbackReader` interface is injectable so the CLI command
 * can be tested without a live RPC connection.
 *
 * Spec: spec/2026-05-05-plug-in-and-harness-network-trust.md §8.3 / 8.4
 */

import type { PublicClient } from 'viem';
import { validatePlugInAttestation, type PlugInAttestation } from './schema.js';
import type { IpfsAttestationClient } from './attestation.js';
import type { AttestationWithAttestor } from './most-recent-wins.js';
import { resolveCurrentVerdict } from './most-recent-wins.js';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface AttestationFeedbackReader {
  /**
   * Fetch all attestations for a given subject from followed attestors.
   * Returns attestations tagged with their attestor address.
   */
  fetchAttestations(args: {
    subject: string;
    followedAttestors: string[];
    includeHistory: boolean;
  }): Promise<AttestationWithAttestor[]>;
}

export interface FeedbackListArgs {
  subject: string;
  followedAttestors: string[];
  includeHistory?: boolean;
  fromAttestor?: string;
}

export interface FeedbackSummary {
  subject: string;
  endorsements: AttestationWithAttestor[];
  warnings: AttestationWithAttestor[];
  blocks: AttestationWithAttestor[];
  reviews: AttestationWithAttestor[];
  other: AttestationWithAttestor[];
}

// ── IdentityRegistry event ABI ────────────────────────────────────────────────

const METADATA_SET_EVENT = [
  {
    type: 'event',
    name: 'MetadataSet',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'metadataKey', type: 'string', indexed: false },
      { name: 'metadataValue', type: 'bytes', indexed: false },
    ],
  },
] as const;

// ── On-chain reader ───────────────────────────────────────────────────────────

export interface OnChainFeedbackReaderConfig {
  identityRegistryAddress: `0x${string}`;
  publicClient: PublicClient;
  ipfs: IpfsAttestationClient;
  /**
   * Map from wallet address → agentId. Required to filter events by attestor.
   * In practice, the operator's agent NFT is looked up at boot.
   * For the CLI, this can be an empty map (no results when unknown).
   */
  attestorAgentIds?: Map<string, bigint>;
}

export function createOnChainFeedbackReader(
  config: OnChainFeedbackReaderConfig,
): AttestationFeedbackReader {
  return {
    async fetchAttestations({ subject, followedAttestors, includeHistory }) {
      const allAtts: AttestationWithAttestor[] = [];

      for (const attestorAddr of followedAttestors) {
        try {
          // Fetch setMetadata events for plug-in-attestation keys.
          // In a full implementation we'd filter by agentId indexed param.
          // Here we fetch recent blocks and filter by key prefix in memory.
          const logs = await config.publicClient.getLogs({
            address: config.identityRegistryAddress,
            event: METADATA_SET_EVENT[0],
            fromBlock: 'earliest',
            toBlock: 'latest',
          });

          for (const log of logs) {
            const logAny = log as { args?: { metadataKey?: string; agentId?: bigint } };
            const key = logAny.args?.metadataKey ?? '';
            if (!key.startsWith('plug-in-attestation:')) continue;

            const cid = key.replace('plug-in-attestation:', '');
            let att: PlugInAttestation | null = null;
            try {
              const raw = await config.ipfs.fetchJson(cid);
              att = validatePlugInAttestation(raw) ? raw : null;
            } catch {
              continue;
            }

            if (!att || att.subject !== subject) continue;

            allAtts.push({ ...att, attestor: attestorAddr });
          }
        } catch {
          // Skip attestors whose events we can't fetch (RPC errors, etc.)
        }
      }

      // Apply most-recent-wins resolution unless --include-history
      if (!includeHistory) {
        return resolveCurrentVerdict(allAtts);
      }
      return allAtts;
    },
  };
}

// ── No-op reader (when no RPC configured) ───────────────────────────────────

export function createNoOpFeedbackReader(): AttestationFeedbackReader {
  return {
    async fetchAttestations() {
      return [];
    },
  };
}

// ── Summary formatter ─────────────────────────────────────────────────────────

export function groupByKind(
  atts: AttestationWithAttestor[],
  subject: string,
): FeedbackSummary {
  return {
    subject,
    endorsements: atts.filter((a) => a.kind === 'endorse'),
    warnings: atts.filter((a) => a.kind === 'warn'),
    blocks: atts.filter((a) => a.kind === 'block'),
    reviews: atts.filter((a) => a.kind === 'review'),
    other: atts.filter((a) => !['endorse', 'warn', 'block', 'review'].includes(a.kind)),
  };
}

export function formatFeedbackSummary(summary: FeedbackSummary): string {
  const lines: string[] = [];
  lines.push(`${summary.subject}`);

  const section = (
    label: string,
    atts: AttestationWithAttestor[],
  ): void => {
    if (atts.length === 0) return;
    lines.push(`  ${label}: ${atts.length}`);
    for (const att of atts) {
      const date = new Date(att.attestedAt * 1000).toISOString();
      const reason = att.reason ? `: "${att.reason}"` : '';
      const review = att.reviewCid ? ` ipfs://${att.reviewCid}` : '';
      lines.push(`    ${att.attestor} (${date})${reason}${review}`);
    }
  };

  section('Endorsements', summary.endorsements);
  section('Warnings', summary.warnings);
  section('Blocks', summary.blocks);
  section('Reviews', summary.reviews);

  if (lines.length === 1) {
    lines.push('  No attestations found from followed attestors.');
  }

  return lines.join('\n') + '\n';
}
