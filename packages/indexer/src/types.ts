/**
 * Shared types for the Jinn protocol indexer package.
 *
 * These types mirror the canonical definitions in client/src/discovery/types.ts
 * and client/src/corpus/types.ts. They are duplicated here (not imported from
 * @jinn-network/client) to keep the indexer package free of daemon dependencies.
 *
 * When the DiscoveryAPI types are promoted to @jinn-network/sdk, replace these
 * with imports from there and remove the duplicates.
 *
 * The GraphQL→DiscoveryAPI adapter (src/api/discovery-adapter.ts) exports a
 * createDiscoveryAPIClient that returns an object typed against DiscoveryAPI
 * below — the daemon's future HttpDiscoveryAPI will import and use it.
 */

// ── ClaimableTaskCandidate ────────────────────────────────────────────────────

/**
 * Mirror of client/src/discovery/types.ts ClaimableTaskCandidate.
 * The findClaimableTasks method returns these.
 */
export interface ClaimableTaskCandidate {
  taskId: string;
  taskCidDigest: `0x${string}`;
  manifestDigest: `0x${string}`;
  createdAtBlock?: number;
  createdAtTx?: `0x${string}`;
  claimWindowEnd?: number;
  maxClaims?: number;
  attemptCount: number;
  operatorAttemptCount: number;
}

// ── SolverNet types ───────────────────────────────────────────────────────────

/**
 * Mirror of client/src/solvernets/registry-client.ts SolverNetLifecycleStatus.
 */
export interface SolverNetLifecycleStatus {
  status: 'launched' | 'paused' | 'retired';
  statusUpdatedAt: string;
  sourceBlock: number;
}

/**
 * Mirror of client/src/solvernets/registry-client.ts SolverNetManifestSummary.
 *
 * All 13 canonical fields are present. The 8 fields that require an IPFS
 * manifest fetch (`solverNetId`, `name`, `network`, `launcherSafeAddress`,
 * `contractId`, `contractVersion`, `solutionPriceWei`, `verdictPriceWei`,
 * `openRoles`) are populated with sentinel/empty values by the indexer adapter
 * since the indexer only stores on-chain event data. Consumers (e.g. the
 * daemon's `HttpDiscoveryAPI`) are responsible for enriching those fields by
 * fetching the IPFS manifest body — exactly as
 * `solvernets/registry-client-erc8004.ts:listLaunched` already does.
 *
 * See README.md §Known limitations — "SolverNetManifestSummary is a partial mirror".
 */
export interface SolverNetManifestSummary {
  manifestCid: string;
  /** Sentinel: set to `manifestCid` by the indexer adapter (IPFS-only field). */
  solverNetId: string;
  /** Sentinel: empty string by the indexer adapter (IPFS-only field). */
  name: string;
  /** Sentinel: empty string by the indexer adapter (IPFS-only field). */
  network: string;
  launcherAgentId: string;
  /** Sentinel: zero address by the indexer adapter (IPFS-only field). */
  launcherSafeAddress: `0x${string}`;
  status: 'launched' | 'paused' | 'retired';
  statusUpdatedAt: string;
  /** Sentinel: empty string by the indexer adapter (IPFS-only field). */
  contractId: string;
  /** Sentinel: empty string by the indexer adapter (IPFS-only field). */
  contractVersion: string;
  /** Sentinel: '0' by the indexer adapter (IPFS-only field). */
  solutionPriceWei: string;
  /** Sentinel: '0' by the indexer adapter (IPFS-only field). */
  verdictPriceWei: string;
  /** Sentinel: empty array by the indexer adapter (IPFS-only field). */
  openRoles: Array<'solver' | 'evaluator'>;
  anchorBlock: number;
}

// ── Corpus types ─────────────────────────────────────────────────────────────

/**
 * Mirror of client/src/corpus/types.ts EnvelopeRef.
 */
export interface EnvelopeRef {
  manifestCid: string;
  manifestHash: string;
  operator: { agentId: string; safeAddress: string };
  evidenceTier: 'self-signed' | 'committed' | 'attested' | 'unknown';
  publishedAt: number;
}

/**
 * Mirror of client/src/corpus/types.ts CorpusQuery.
 */
export interface CorpusQuery {
  solverType?: string;
  artifactType?: string;
  taskCid?: string;
  participant?: { safeAddress?: string };
  evidenceTier?: 'self-signed' | 'committed' | 'attested';
  generatedAfter?: number;
  generatedBefore?: number;
  limit?: number;
}

// ── DiscoveryAPI interface ────────────────────────────────────────────────────

/**
 * Mirror of client/src/discovery/types.ts DiscoveryAPI.
 * The adapter in src/api/discovery-adapter.ts implements this interface.
 */
export interface DiscoveryAPI {
  findClaimableTasks(args: {
    solverNetManifestCids: string[];
    operatorAddress: `0x${string}`;
    nowSeconds?: number;
    pageSize?: number;
    maxPages?: number;
  }): Promise<ClaimableTaskCandidate[]>;

  listLaunchedSolverNets(args?: {
    launcherAgentId?: string;
    status?: Array<'launched' | 'paused' | 'retired'>;
  }): Promise<SolverNetManifestSummary[]>;

  getLifecycleStatus(manifestCid: string): Promise<SolverNetLifecycleStatus | undefined>;

  queryEnvelopes(query: CorpusQuery): Promise<EnvelopeRef[]>;
}

// ── DiscoveryUnavailableError ─────────────────────────────────────────────────

/**
 * Mirror of client/src/discovery/types.ts DiscoveryUnavailableError.
 * Thrown by createDiscoveryAPIClient when the Ponder GraphQL endpoint is
 * unreachable or returns errors. The daemon's withFallback wrapper catches
 * this and routes to the OnchainDiscoveryAPI floor.
 */
export class DiscoveryUnavailableError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DiscoveryUnavailableError';
    this.cause = cause;
  }
}

// ── Evidence tier mapping ─────────────────────────────────────────────────────

/**
 * Maps the uint8 tier value from ABI-decoded payloads to the string
 * representation used by EnvelopeRef.evidenceTier.
 */
export function tierFromRaw(value: number): EnvelopeRef['evidenceTier'] {
  if (value === 0) return 'self-signed';
  if (value === 1) return 'committed';
  if (value === 3) return 'attested';
  return 'unknown';
}

/**
 * Parses the key of an IdentityRegistry.MetadataSet event to determine its
 * kind and CID. Returns null if the key does not match any known pattern.
 *
 * Known key patterns (from client/src/corpus/onchain-query.ts):
 *   `envelope:<cid>`    — execution evidence
 *   `evaluation:<cid>`  — evaluation verdict
 *   `capture:<cid>`     — capture
 */
export function parseEnvelopeKey(key: string): { kind: string; cid: string } | null {
  const colon = key.indexOf(':');
  if (colon <= 0 || colon === key.length - 1) return null;
  const kind = key.slice(0, colon);
  if (kind !== 'envelope' && kind !== 'evaluation' && kind !== 'capture') return null;
  return { kind, cid: key.slice(colon + 1) };
}

/**
 * Returns true if the given metadata key is a SolverNet manifest key
 * (`solvernet-manifest:<cid>`).
 */
export const SOLVERNET_MANIFEST_KEY_PREFIX = 'solvernet-manifest:';

export function parseSolverNetManifestKey(key: string): string | null {
  if (!key.startsWith(SOLVERNET_MANIFEST_KEY_PREFIX)) return null;
  const cid = key.slice(SOLVERNET_MANIFEST_KEY_PREFIX.length);
  return cid.length > 0 ? cid : null;
}
