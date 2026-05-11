/**
 * GraphQL→DiscoveryAPI adapter for the Jinn protocol indexer.
 *
 * Exports `createDiscoveryAPIClient(opts)` which returns an object implementing
 * the DiscoveryAPI interface (mirrored in ../types.ts) backed by the Ponder
 * indexer's auto-generated GraphQL endpoint.
 *
 * This is the wire-contract layer: it translates the four DiscoveryAPI methods
 * into GraphQL queries and parses responses. Any GraphQL errors or network
 * failures wrap into DiscoveryUnavailableError so the daemon's withFallback
 * chain can engage the OnchainDiscoveryAPI floor.
 *
 * The adapter is self-contained in the indexer package — no dependency on
 * @jinn-network/client. The daemon's future HttpDiscoveryAPI will import
 * createDiscoveryAPIClient from this package.
 *
 * Spec: spec/2026-05-11-discovery-api-and-shared-indexer.md §6.1.
 */
import type {
  DiscoveryAPI,
  ClaimableTaskCandidate,
  SolverNetManifestSummary,
  SolverNetLifecycleStatus,
  EnvelopeRef,
  CorpusQuery,
} from '../types.js';
import { DiscoveryUnavailableError } from '../types.js';

// ── GraphQL query strings ─────────────────────────────────────────────────────

/**
 * Claimable tasks query. Fetches task rows in pages; attempt counts are
 * retrieved in a single batched round-trip via ATTEMPTS_FOR_TASKS_QUERY
 * (note the plural form) after each page is fetched.
 *
 * NOTE: The GraphQL field names match ponder.schema.ts column names (camelCase
 * as exposed by Ponder's auto-generated GraphQL layer).
 *
 * claimWindowStart/claimWindowEnd are queried but may be null (see schema note).
 * The daemon's canClaimTask simulation is the correctness gate at claim time.
 */
const TASKS_QUERY = `
query Tasks(
  $manifestDigest: String!,
  $limit: Int!,
  $offset: Int!
) {
  tasks(
    where: {
      manifestDigest: $manifestDigest,
      finalized: false,
      refunded: false
    },
    limit: $limit,
    offset: $offset,
    orderBy: "id",
    orderDirection: "asc"
  ) {
    items {
      id
      taskCidDigest
      manifestDigest
      createdAtBlock
      createdAtTx
      claimWindowEnd
      maxClaims
      chainId
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

/**
 * Batched attempt fetch for a page of tasks.
 *
 * Ponder's auto-generated GraphQL exposes `_in` filter operators on indexed
 * text columns. The `attempt.taskId` column has an `index` directive in
 * ponder.schema.ts which satisfies Ponder 0.16.x's prerequisite for `_in`
 * support. This single query replaces the N per-task queries that were causing
 * an N+1 round-trip problem (at pageSize=100, that was 100 serial requests).
 *
 * Limit is set to 10000 (100 tasks × 100 attempts each) as a safe upper bound.
 * Client-side grouping by taskId produces per-task counts.
 */
const ATTEMPTS_FOR_TASKS_QUERY = `
query AttemptsForTasks($taskIds: [String!]!, $chainId: Int!) {
  attempts(
    where: { taskId_in: $taskIds, chainId: $chainId },
    limit: 10000
  ) {
    items {
      taskId
      operator
      attemptIndex
    }
  }
}
`;

const LIST_SOLVER_NETS_QUERY = `
query ListSolverNets(
  $statusFilter: [String!],
  $launcherAgentId: String
) {
  solverNetManifests(
    where: {
      status_in: $statusFilter,
      launcherAgentId: $launcherAgentId
    },
    limit: 200,
    orderBy: "anchorBlock",
    orderDirection: "desc"
  ) {
    items {
      id
      launcherAgentId
      status
      statusUpdatedAt
      manifestHash
      anchorBlock
      chainId
    }
  }
}
`;

const LIST_SOLVER_NETS_NO_AGENT_QUERY = `
query ListSolverNetsNoAgent(
  $statusFilter: [String!]
) {
  solverNetManifests(
    where: {
      status_in: $statusFilter
    },
    limit: 200,
    orderBy: "anchorBlock",
    orderDirection: "desc"
  ) {
    items {
      id
      launcherAgentId
      status
      statusUpdatedAt
      manifestHash
      anchorBlock
      chainId
    }
  }
}
`;

const GET_LIFECYCLE_STATUS_QUERY = `
query GetLifecycleStatus($manifestCid: String!) {
  solverNetManifest(id: $manifestCid) {
    status
    statusUpdatedAt
    anchorBlock
  }
}
`;

const QUERY_ENVELOPES_QUERY = `
query QueryEnvelopes(
  $kind: String,
  $evidenceTier: String,
  $limit: Int!
) {
  envelopes(
    where: {
      kind: $kind,
      evidenceTier: $evidenceTier
    },
    limit: $limit,
    orderBy: "publishedAtBlock",
    orderDirection: "desc"
  ) {
    items {
      agentId
      manifestCid
      manifestHash
      evidenceTier
      publishedAtBlock
    }
  }
}
`;

// ── GraphQL response types ────────────────────────────────────────────────────

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface TaskRow {
  id: string;
  taskCidDigest: string;
  manifestDigest: string;
  createdAtBlock?: string | number | null;
  createdAtTx?: string | null;
  claimWindowEnd?: string | number | null;
  maxClaims?: number | null;
  chainId: number;
}

interface AttemptRow {
  /** taskId is only present in the batched ATTEMPTS_FOR_TASKS_QUERY response. */
  taskId: string;
  operator: string;
  attemptIndex: number;
}

interface TasksPage {
  tasks: {
    items: TaskRow[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
}

interface AttemptsPage {
  attempts: { items: AttemptRow[] };
}

interface SolverNetRow {
  id: string;
  launcherAgentId: string;
  status: string;
  statusUpdatedAt: string;
  manifestHash: string;
  anchorBlock: string | number;
  chainId: number;
}

interface SolverNetPage {
  solverNetManifests: { items: SolverNetRow[] };
}

interface SolverNetSingle {
  solverNetManifest: {
    status: string;
    statusUpdatedAt: string;
    anchorBlock: string | number;
  } | null;
}

interface EnvelopeRow {
  agentId: string;
  manifestCid: string;
  manifestHash: string;
  evidenceTier: string;
  publishedAtBlock: string | number;
}

interface EnvelopePage {
  envelopes: { items: EnvelopeRow[] };
}

// ── Client options ────────────────────────────────────────────────────────────

export interface DiscoveryAPIClientOptions {
  /** URL of the Ponder GraphQL endpoint, e.g. http://localhost:42069/graphql */
  url: string;
  /**
   * Custom fetch implementation. Defaults to globalThis.fetch.
   * Pass a mock in tests to assert request shapes.
   */
  fetchImpl?: typeof fetch;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOptionalNumber(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isHex(value: string | undefined): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);
}

async function postGql<T>(
  url: string,
  fetchImpl: typeof fetch,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new DiscoveryUnavailableError(`Ponder GraphQL network error: ${String(err)}`, err);
  }

  if (!response.ok) {
    throw new DiscoveryUnavailableError(
      `Ponder GraphQL HTTP ${response.status} ${response.statusText}`,
    );
  }

  let json: GqlResponse<T>;
  try {
    json = await response.json() as GqlResponse<T>;
  } catch (err) {
    throw new DiscoveryUnavailableError(`Ponder GraphQL response parse error: ${String(err)}`, err);
  }

  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message ?? 'unknown').join('; ');
    throw new DiscoveryUnavailableError(`Ponder GraphQL error: ${msg}`);
  }

  if (!json.data) {
    throw new DiscoveryUnavailableError('Ponder GraphQL response missing data field');
  }

  return json.data;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a DiscoveryAPI client backed by a Ponder GraphQL endpoint.
 *
 * Usage (future HttpDiscoveryAPI in daemon):
 *
 *   import { createDiscoveryAPIClient } from '@jinn-network/indexer/discovery-adapter';
 *   const discovery = createDiscoveryAPIClient({ url: 'https://my-indexer.example/graphql' });
 *   const tasks = await discovery.findClaimableTasks({ ... });
 */
export function createDiscoveryAPIClient(opts: DiscoveryAPIClientOptions): DiscoveryAPI {
  const gqlUrl = opts.url.endsWith('/graphql') ? opts.url : `${opts.url}/graphql`;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error('No fetch implementation available; pass fetchImpl in options');
  }

  // ── findClaimableTasks ────────────────────────────────────────────────────

  async function findClaimableTasks(args: {
    solverNetManifestCids: string[];
    operatorAddress: `0x${string}`;
    nowSeconds?: number;
    pageSize?: number;
    maxPages?: number;
  }): Promise<ClaimableTaskCandidate[]> {
    const { keccak256, toBytes } = await import('viem');
    const cids = Array.from(new Set(args.solverNetManifestCids.filter(Boolean)));
    if (cids.length === 0) return [];

    const pageSize = Math.min(200, Math.max(1, args.pageSize ?? 100));
    const maxPages = Math.max(1, args.maxPages ?? 5);
    const operatorLower = args.operatorAddress.toLowerCase();
    const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
    const seen = new Set<string>();
    const out: ClaimableTaskCandidate[] = [];

    for (const cid of cids) {
      const manifestDigest = keccak256(toBytes(cid));

      for (let page = 0; page < maxPages; page++) {
        const data = await postGql<TasksPage>(
          gqlUrl,
          fetchImpl,
          TASKS_QUERY,
          { manifestDigest, limit: pageSize, offset: page * pageSize },
        );

        const rows = data.tasks?.items ?? [];

        // Validate and de-duplicate rows before batch fetching attempts.
        const validRows = rows.filter((row) => {
          if (seen.has(row.id)) return false;
          if (!isHex(row.taskCidDigest) || !isHex(row.manifestDigest)) return false;
          return true;
        });

        // Group attempt counts by taskId from the batched response.
        const attemptCountByTaskId = new Map<string, number>();
        const operatorAttemptCountByTaskId = new Map<string, number>();

        if (validRows.length > 0) {
          // Batch-fetch all attempts for this page of tasks in a single round-trip.
          // This replaces the previous N+1 pattern (one query per task) with one
          // query per page of tasks. ATTEMPTS_FOR_TASKS_QUERY uses the `taskId_in`
          // filter which Ponder 0.16.x supports on indexed text columns.
          const taskIds = validRows.map((r) => r.id);

          // All rows in a page share the same chainId (single-chain query), so
          // take chainId from the first valid row.
          const pageChainId = validRows[0].chainId;

          try {
            const attData = await postGql<AttemptsPage>(
              gqlUrl,
              fetchImpl,
              ATTEMPTS_FOR_TASKS_QUERY,
              { taskIds, chainId: pageChainId },
            );
            for (const a of attData.attempts?.items ?? []) {
              attemptCountByTaskId.set(a.taskId, (attemptCountByTaskId.get(a.taskId) ?? 0) + 1);
              if (a.operator.toLowerCase() === operatorLower) {
                operatorAttemptCountByTaskId.set(
                  a.taskId,
                  (operatorAttemptCountByTaskId.get(a.taskId) ?? 0) + 1,
                );
              }
            }
          } catch {
            // Batch attempt fetch failed — treat all as zero; daemon will re-verify at claim time.
          }
        }

        for (const row of validRows) {
          const attemptCount = attemptCountByTaskId.get(row.id) ?? 0;
          const operatorAttemptCount = operatorAttemptCountByTaskId.get(row.id) ?? 0;

          // maxClaims gate: skip if task is fully claimed.
          const maxClaims = typeof row.maxClaims === 'number' && row.maxClaims > 0
            ? row.maxClaims
            : undefined;
          if (maxClaims !== undefined && attemptCount >= maxClaims) continue;

          // claimWindowEnd gate (if available): skip expired tasks.
          const claimWindowEnd = parseOptionalNumber(row.claimWindowEnd);
          if (claimWindowEnd !== undefined && claimWindowEnd < now) continue;

          seen.add(row.id);

          const candidate: ClaimableTaskCandidate = {
            taskId: row.id,
            taskCidDigest: row.taskCidDigest as `0x${string}`,
            manifestDigest: row.manifestDigest as `0x${string}`,
            attemptCount,
            operatorAttemptCount,
          };

          const createdAtBlock = parseOptionalNumber(row.createdAtBlock);
          if (createdAtBlock !== undefined) candidate.createdAtBlock = createdAtBlock;
          if (isHex(row.createdAtTx ?? undefined)) candidate.createdAtTx = row.createdAtTx as `0x${string}`;
          if (claimWindowEnd !== undefined) candidate.claimWindowEnd = claimWindowEnd;
          if (maxClaims !== undefined) candidate.maxClaims = maxClaims;

          out.push(candidate);
        }

        const hasNextPage = data.tasks?.pageInfo?.hasNextPage ?? (rows.length === pageSize);
        if (!hasNextPage) break;
      }
    }

    out.sort((a, b) => Number(BigInt(a.taskId) - BigInt(b.taskId)));
    return out;
  }

  // ── listLaunchedSolverNets ────────────────────────────────────────────────

  async function listLaunchedSolverNets(args?: {
    launcherAgentId?: string;
    status?: Array<'launched' | 'paused' | 'retired'>;
  }): Promise<SolverNetManifestSummary[]> {
    const statusFilter = args?.status ?? ['launched', 'paused', 'retired'];
    const launcherAgentId = args?.launcherAgentId;

    let data: SolverNetPage;
    if (launcherAgentId) {
      data = await postGql<SolverNetPage>(
        gqlUrl,
        fetchImpl,
        LIST_SOLVER_NETS_QUERY,
        { statusFilter, launcherAgentId },
      );
    } else {
      data = await postGql<SolverNetPage>(
        gqlUrl,
        fetchImpl,
        LIST_SOLVER_NETS_NO_AGENT_QUERY,
        { statusFilter },
      );
    }

    return (data.solverNetManifests?.items ?? []).map((row): SolverNetManifestSummary => ({
      manifestCid: row.id,
      // The 8 fields below are IPFS-only: not stored in the indexer. Populate
      // with the same sentinels used by OnchainDiscoveryAPI.listLaunchedSolverNets
      // in client/src/discovery/onchain.ts. Consumers enrich via IPFS fetch.
      solverNetId: row.id,                                          // best-effort: cid as id
      name: '',                                                      // requires IPFS fetch
      network: '',                                                   // requires IPFS fetch
      launcherSafeAddress: '0x0000000000000000000000000000000000000000', // requires IPFS fetch
      contractId: '',                                                // requires IPFS fetch
      contractVersion: '',                                           // requires IPFS fetch
      solutionPriceWei: '0',                                        // requires IPFS fetch
      verdictPriceWei: '0',                                         // requires IPFS fetch
      openRoles: [],                                                 // requires IPFS fetch
      launcherAgentId: row.launcherAgentId,
      status: (row.status as 'launched' | 'paused' | 'retired') ?? 'launched',
      statusUpdatedAt: row.statusUpdatedAt,
      anchorBlock: Number(row.anchorBlock),
    }));
  }

  // ── getLifecycleStatus ────────────────────────────────────────────────────

  async function getLifecycleStatus(manifestCid: string): Promise<SolverNetLifecycleStatus | undefined> {
    const data = await postGql<SolverNetSingle>(
      gqlUrl,
      fetchImpl,
      GET_LIFECYCLE_STATUS_QUERY,
      { manifestCid },
    );

    const row = data.solverNetManifest;
    if (!row) return undefined;

    const validStatus = (s: string): s is 'launched' | 'paused' | 'retired' =>
      s === 'launched' || s === 'paused' || s === 'retired';

    return {
      status: validStatus(row.status) ? row.status : 'launched',
      statusUpdatedAt: row.statusUpdatedAt,
      sourceBlock: Number(row.anchorBlock),
    };
  }

  // ── queryEnvelopes ────────────────────────────────────────────────────────

  async function queryEnvelopes(query: CorpusQuery): Promise<EnvelopeRef[]> {
    const limit = Math.min(500, Math.max(1, query.limit ?? 50));

    // Map CorpusQuery fields to GraphQL filter variables.
    // kind is not directly in CorpusQuery; we query all envelope kinds.
    // evidenceTier is a direct filter.
    // query.solverType is intentionally ignored: solverType lives in the IPFS
    // manifest body, not in the on-chain envelope payload, so the indexer has
    // no column for it. Callers must filter by solverType client-side after
    // fetching the IPFS manifests. See README.md §Known limitations.
    const variables: Record<string, unknown> = {
      kind: null,        // null = no filter on kind in the current schema
      evidenceTier: query.evidenceTier ?? null,
      limit,
    };

    const data = await postGql<EnvelopePage>(
      gqlUrl,
      fetchImpl,
      QUERY_ENVELOPES_QUERY,
      variables,
    );

    const items = data.envelopes?.items ?? [];

    // Map to EnvelopeRef. The indexer does not store safeAddress (not in the
    // IdentityRegistry event); leave it empty. The corpus library enriches it
    // on retrieval via the IPFS manifest fetch.
    return items.map((row): EnvelopeRef => ({
      manifestCid: row.manifestCid,
      manifestHash: row.manifestHash,
      operator: {
        agentId: row.agentId,
        safeAddress: '',
      },
      evidenceTier: (row.evidenceTier as EnvelopeRef['evidenceTier']) ?? 'unknown',
      publishedAt: Number(row.publishedAtBlock),
    }));
  }

  return {
    findClaimableTasks,
    listLaunchedSolverNets,
    getLifecycleStatus,
    queryEnvelopes,
  };
}
