/**
 * Ponder event handlers for the Jinn protocol indexer.
 *
 * Four event sources, each mapped to one entity in ponder.schema.ts:
 *
 *   JinnRouter:TaskCreated          → task
 *   JinnRouter:TaskAttemptCreated   → attempt
 *   JinnRouter:SolutionDeliveryClaimed → task.finalized = true
 *   IdentityRegistry:MetadataSet    → solverNetManifest OR envelope (routed by key)
 *
 * Handlers are pure event-to-row mappings with no business logic. The
 * correctness gate (canClaimTask simulation) lives in the daemon adapter,
 * not here.
 *
 * Ponder docs: https://ponder.sh/docs/indexing/event-handlers
 * Schema: ponder.schema.ts
 */
import { ponder } from 'ponder:registry';
import { task, attempt, solverNetManifest, envelope } from 'ponder:schema';
import { decodeAbiParameters, type Hex } from 'viem';
import {
  parseEnvelopeKey,
  parseSolverNetManifestKey,
  tierFromRaw,
} from './types.js';

// ── ABI tuple for payload decoding ────────────────────────────────────────────
// Matches PAYLOAD_TUPLE_V2 in client/src/erc8004/abis.ts. We try V2 first,
// then fall back to V1 (without the trailing harness identity fields).

const PAYLOAD_TUPLE_V2 = [
  { name: 'version', type: 'uint8' },
  { name: 'tier', type: 'uint8' },
  { name: 'manifestHash', type: 'bytes32' },
  { name: 'attestationQuoteCid', type: 'bytes' },
  { name: 'sourceMeasurement', type: 'bytes32' },
  { name: 'codeDigest', type: 'bytes32' },
  { name: 'implName', type: 'string' },
  { name: 'modeFlag', type: 'uint8' },
] as const;

const PAYLOAD_TUPLE_V1 = [
  { name: 'version', type: 'uint8' },
  { name: 'tier', type: 'uint8' },
  { name: 'manifestHash', type: 'bytes32' },
  { name: 'attestationQuoteCid', type: 'bytes' },
  { name: 'sourceMeasurement', type: 'bytes32' },
] as const;

function decodeEnvelopePayload(value: Hex): {
  manifestHash: string;
  evidenceTier: 'self-signed' | 'committed' | 'attested' | 'unknown';
} {
  try {
    const decoded = decodeAbiParameters(PAYLOAD_TUPLE_V2, value);
    return {
      manifestHash: decoded[2],
      evidenceTier: tierFromRaw(Number(decoded[1])),
    };
  } catch {
    // not V2 — try V1
  }
  try {
    const decoded = decodeAbiParameters(PAYLOAD_TUPLE_V1, value);
    return {
      manifestHash: decoded[2],
      evidenceTier: tierFromRaw(Number(decoded[1])),
    };
  } catch {
    return { manifestHash: '', evidenceTier: 'unknown' };
  }
}

// ── JinnRouter: TaskCreated ───────────────────────────────────────────────────

ponder.on('JinnRouter:TaskCreated', async ({ event, context }) => {
  await context.db
    .insert(task)
    .values({
      id: event.args.taskId.toString(),
      manifestDigest: event.args.manifestDigest,
      taskCidDigest: event.args.taskCidDigest,
      creator: event.args.creator,
      maxClaims: Number(event.args.maxClaims),
      createdAtBlock: event.block.number,
      createdAtTx: event.transaction.hash,
      // claimWindowStart and claimWindowEnd are not emitted in TaskCreated on
      // JinnRouter V3 — they require call-trace decoding (280n.4). Left null.
      claimWindowStart: null,
      claimWindowEnd: null,
      finalized: false,
      refunded: false,
      chainId: context.chain.id,
    })
    .onConflictDoNothing();
});

// ── JinnRouter: TaskAttemptCreated ───────────────────────────────────────────

ponder.on('JinnRouter:TaskAttemptCreated', async ({ event, context }) => {
  await context.db
    .insert(attempt)
    .values({
      taskId: event.args.taskId.toString(),
      attemptIndex: Number(event.args.attemptIndex),
      requestId: event.args.requestId,
      operator: event.args.operator,
      priorityMech: event.args.priorityMech,
      deliveryRate: event.args.deliveryRate,
      createdAtBlock: event.block.number,
      chainId: context.chain.id,
    })
    .onConflictDoNothing();
});

// ── JinnRouter: SolutionDeliveryClaimed ──────────────────────────────────────
// Used as a proxy for task finalization. JinnRouter V3 has no standalone
// TaskFinalized event; SolutionDeliveryClaimed is the terminal success state.

ponder.on('JinnRouter:SolutionDeliveryClaimed', async ({ event, context }) => {
  await context.db
    .update(task, { id: event.args.taskId.toString() })
    .set({ finalized: true });
});

// ── IdentityRegistry: MetadataSet ────────────────────────────────────────────
// Routes by key prefix:
//   solvernet-manifest:<cid>  → upsert SolverNetManifest (most-recent-wins)
//   envelope:<cid>            → upsert Envelope
//   evaluation:<cid>          → upsert Envelope
//   capture:<cid>             → upsert Envelope

ponder.on('IdentityRegistry:MetadataSet', async ({ event, context }) => {
  const key = event.args.metadataKey;
  const agentId = event.args.agentId.toString();
  const chainId = context.chain.id;
  const blockNumber = event.block.number;

  // ── SolverNet manifest lifecycle ─────────────────────────────────────────
  const manifestCid = parseSolverNetManifestKey(key);
  if (manifestCid !== null) {
    // Decode the lifecycle payload. The payload is JSON-encoded UTF-8 bytes
    // following the most-recent-wins spec (§6.3):
    //   { schemaVersion, status, at, hash }
    let status: 'launched' | 'paused' | 'retired' = 'launched';
    let statusUpdatedAt = new Date().toISOString();
    let manifestHash: `0x${string}` = '0x';
    let transactionIndex = 0;

    try {
      const payloadText = Buffer.from(event.args.metadataValue.slice(2), 'hex').toString('utf8');
      const payload = JSON.parse(payloadText) as {
        status?: string;
        at?: string;
        hash?: string;
        schemaVersion?: string;
      };
      if (payload.status === 'launched' || payload.status === 'paused' || payload.status === 'retired') {
        status = payload.status;
      }
      if (payload.at) statusUpdatedAt = payload.at;
      if (payload.hash && /^0x[0-9a-fA-F]{64}$/.test(payload.hash)) {
        manifestHash = payload.hash as `0x${string}`;
      }
      if (typeof event.transaction.transactionIndex === 'number') {
        transactionIndex = event.transaction.transactionIndex;
      }
    } catch {
      // Non-JSON payload — skip this event; it's not a valid lifecycle update.
      return;
    }

    // Most-recent-wins upsert: only update if the new event is from the same
    // or a later block (ties broken by transactionIndex).
    await context.db
      .insert(solverNetManifest)
      .values({
        id: manifestCid,
        launcherAgentId: agentId,
        status,
        statusUpdatedAt,
        manifestHash,
        anchorBlock: blockNumber,
        anchorTransactionIndex: transactionIndex,
        chainId,
      })
      .onConflictDoUpdate((row) => {
        // Only update if the incoming event is more recent than the stored one.
        //
        // IMPORTANT: Drizzle's onConflictDoUpdate generates `ON CONFLICT DO UPDATE
        // SET col1 = val1, col2 = val2, ...`. Returning `{}` here would produce an
        // empty SET clause which is invalid SQL on Postgres/PGlite. The no-op path
        // must return all existing row fields so Drizzle generates a valid
        // `SET col = col, ...` statement — semantically a no-op, syntactically valid.
        if (
          blockNumber > row.anchorBlock ||
          (blockNumber === row.anchorBlock && transactionIndex > row.anchorTransactionIndex)
        ) {
          return {
            launcherAgentId: agentId,
            status,
            statusUpdatedAt,
            manifestHash,
            anchorBlock: blockNumber,
            anchorTransactionIndex: transactionIndex,
            chainId,
          };
        }
        // No-op: return existing row fields so Drizzle generates valid SQL.
        // (SET col = col, ... is a valid no-op; SET with empty SET clause is not.)
        return {
          launcherAgentId: row.launcherAgentId,
          status: row.status,
          statusUpdatedAt: row.statusUpdatedAt,
          manifestHash: row.manifestHash,
          anchorBlock: row.anchorBlock,
          anchorTransactionIndex: row.anchorTransactionIndex,
          chainId: row.chainId,
        };
      });
    return;
  }

  // ── Envelope (evidence / evaluation / capture) ───────────────────────────
  const envelopeKey = parseEnvelopeKey(key);
  if (envelopeKey !== null) {
    const payload = decodeEnvelopePayload(event.args.metadataValue as Hex);
    const logIndex = typeof event.log.logIndex === 'number' ? event.log.logIndex : 0;

    // Guard against empty manifestHash from total decode failures.
    // `decodeEnvelopePayload` returns `manifestHash: ''` when both V2 and V1
    // decode attempts throw. An empty string is not a valid hex value and would
    // fail the `hex()` column constraint at runtime. Substitute `'0x'` (a valid
    // zero-length hex sentinel) so the row is written and the event is not lost.
    // The daemon compensates: canClaimTask and corpus-fetch verify content via
    // the IPFS manifest hash independently of this indexed copy.
    const manifestHash = (payload.manifestHash || '0x') as `0x${string}`;

    await context.db
      .insert(envelope)
      .values({
        agentId,
        metadataKey: key,
        chainId,
        kind: envelopeKey.kind,
        manifestCid: envelopeKey.cid,
        manifestHash,
        evidenceTier: payload.evidenceTier,
        publishedAtBlock: blockNumber,
        logIndex,
      })
      .onConflictDoUpdate({
        // If the same agent re-publishes to the same key, update with new data.
        manifestHash,
        evidenceTier: payload.evidenceTier,
        publishedAtBlock: blockNumber,
        logIndex,
      });
    return;
  }

  // Any other key (e.g. future metadata types) — no-op.
});
