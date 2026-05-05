/**
 * IdentityPublisher-backed implementation of AttestationReputationClient.
 *
 * Phase 5's AttestationReputationClient interface assumed a generic
 * `targetAgentId + feedbackURI + feedbackHash` shape, but the right on-chain
 * primitive for plug-in attestations is `setMetadata` on IdentityRegistry —
 * not `giveFeedback` on ReputationRegistry. This bridge adapts the interface:
 *
 * - `feedbackURI` must be `"plug-in-attestation:<cid>"` — the CID becomes the
 *   metadata key component.
 * - `feedbackHash` is interpreted as the attested package's manifestHash and
 *   encoded compactly on-chain as `(uint8 version=1, bytes32 manifestHash)`.
 * - `targetAgentId` is ignored — plug-in attestations anchor under the
 *   operator's own agentId carried by the IdentityPublisher instance.
 *
 * Why setMetadata instead of giveFeedback:
 *   - Anchors attestations under the operator's own agent NFT (matches the
 *     headless-brand "operators are the trust source" model).
 *   - No self-feedback revert risk (setMetadata is not constrained that way).
 *   - No new on-chain schema to register; reuses existing operator identity.
 *
 * Spec: spec/2026-05-05-plug-in-and-harness-network-trust.md §8.1 (bridge)
 */

import type { Hex } from 'viem';
import { encodePlugInAttestationPayload } from '../erc8004/identity.js';
import type { IdentityPublisher } from '../erc8004/identity.js';
import type { AttestationReputationClient } from './attestation.js';

export interface IdentityBackedAttestationClientArgs {
  publisher: IdentityPublisher;
}

/**
 * Create an `AttestationReputationClient` backed by `IdentityPublisher.publishRaw`.
 *
 * The returned client maps `giveFeedback({ feedbackURI, feedbackHash })` onto
 * `IdentityRegistry.setMetadata(agentId, "plug-in-attestation:<cid>", payload)`
 * where `payload` is `abi.encode(uint8(1), bytes32(manifestHash))`.
 */
export function createIdentityBackedAttestationClient(
  args: IdentityBackedAttestationClientArgs,
): AttestationReputationClient {
  return {
    async giveFeedback({ targetAgentId: _targetAgentId, feedbackURI, feedbackHash }) {
      // Extract the CID from "plug-in-attestation:<cid>"
      const cidMatch = feedbackURI.match(/^plug-in-attestation:(.+)$/);
      if (!cidMatch || !cidMatch[1]) {
        throw new Error(
          `expected feedbackURI with scheme "plug-in-attestation:<cid>", got: ${feedbackURI}`,
        );
      }
      const cid = cidMatch[1];

      // feedbackHash is the sha256 of the attestation JSON from publishAttestation.
      // We re-interpret it here as the on-chain manifestHash payload — the hash is
      // passed through directly so the bridge is composable without a second lookup.
      const payload = encodePlugInAttestationPayload(feedbackHash as Hex);

      const txHash = await args.publisher.publishRaw({
        kind: 'plug-in-attestation',
        cid,
        payload,
      });

      return txHash;
    },
  };
}
