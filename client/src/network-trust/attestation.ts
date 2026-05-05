/**
 * Attestation publish and read primitives for plug-in / harness network trust.
 *
 * Composition: PlugInAttestation JSON is pinned to IPFS; the CID is carried
 * in an ERC-8004 ReputationRegistry `giveFeedback` call via a canonical
 * `feedbackURI = "plug-in-attestation:<cid>"`. The `feedbackHash` is
 * sha256 of the canonical JSON (RFC 8785 JCS).
 *
 * Spec: spec/2026-05-05-plug-in-and-harness-network-trust.md §8.2
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../harnesses/engine/canonical-json.js';
import { validatePlugInAttestation, type PlugInAttestation } from './schema.js';

// ── IPFS client interface ────────────────────────────────────────────────────

/**
 * Minimal IPFS surface required by attestation primitives.
 * Implement against `uploadToIpfs` / `fetchFromIpfs` from
 * `adapters/mech/ipfs.ts` at the call site.
 */
export interface IpfsAttestationClient {
  /** Pin a JSON value to IPFS and return the resulting CID. */
  pinJson(value: unknown): Promise<string>;
  /** Fetch a JSON value from IPFS by CID. */
  fetchJson(cid: string): Promise<unknown>;
}

// ── Reputation client interface ──────────────────────────────────────────────

/**
 * Minimal reputation surface required by `publishAttestation`.
 *
 * Wraps `ReputationRegistryClient.giveFeedback` with a plug-in-attestation-
 * specific call shape. The `feedbackURI` carries the IPFS CID as
 * `"plug-in-attestation:<cid>"` so subgraphs / consumers can filter by kind.
 */
export interface AttestationReputationClient {
  giveFeedback(args: {
    targetAgentId: bigint;
    feedbackURI: string;
    feedbackHash: `0x${string}`;
  }): Promise<string>;
}

// ── Argument and result types ────────────────────────────────────────────────

export interface PublishAttestationArgs {
  attestation: PlugInAttestation;
  /** ERC-8004 agentId of the plug-in / harness operator being attested. */
  targetAgentId: bigint;
  ipfs: IpfsAttestationClient;
  reputation: AttestationReputationClient;
}

export interface PublishAttestationResult {
  ok: boolean;
  txHash?: string;
  cid?: string;
  error?: string;
}

// ── Publish ──────────────────────────────────────────────────────────────────

/**
 * Publish a PlugInAttestation:
 * 1. Validate the attestation against the JSON schema.
 * 2. Pin the canonical JSON to IPFS, obtaining a CID.
 * 3. Submit an ERC-8004 `giveFeedback` with `feedbackURI = "plug-in-attestation:<cid>"`.
 *
 * Returns `{ ok: true, txHash, cid }` on full success, or
 * `{ ok: false, error, cid? }` on any failure (cid is set when pin succeeded
 * but the on-chain call failed, so callers can retry the chain step).
 */
export async function publishAttestation(
  args: PublishAttestationArgs,
): Promise<PublishAttestationResult> {
  if (!validatePlugInAttestation(args.attestation)) {
    return { ok: false, error: 'attestation failed schema validation' };
  }

  const json = canonicalJson(args.attestation);
  const feedbackHash =
    ('0x' + createHash('sha256').update(json).digest('hex')) as `0x${string}`;

  let cid: string;
  try {
    cid = await args.ipfs.pinJson(args.attestation);
  } catch (err) {
    return { ok: false, error: `ipfs pin failed: ${(err as Error).message}` };
  }

  try {
    const tx = await args.reputation.giveFeedback({
      targetAgentId: args.targetAgentId,
      feedbackURI: `plug-in-attestation:${cid}`,
      feedbackHash,
    });
    return { ok: true, txHash: tx, cid };
  } catch (err) {
    return { ok: false, cid, error: `giveFeedback failed: ${(err as Error).message}` };
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch and validate a PlugInAttestation from IPFS by CID.
 * Returns `null` on fetch failure or if the fetched JSON fails schema
 * validation — callers should treat null as "attestation not found / corrupt".
 */
export async function readAttestation(
  cid: string,
  ipfs: IpfsAttestationClient,
): Promise<PlugInAttestation | null> {
  let raw: unknown;
  try {
    raw = await ipfs.fetchJson(cid);
  } catch {
    return null;
  }
  return validatePlugInAttestation(raw) ? raw : null;
}
