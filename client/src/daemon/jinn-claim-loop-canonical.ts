/**
 * Canonical OP-Stack proof construction for the cross-chain JINN claim
 * loop. Implements `jinnMessengerMode === 'canonical'`.
 *
 * Status: SKELETON. The full construction needs:
 *   1. Wait for L2 receipt (viem `waitForTransactionReceipt`).
 *   2. Wait for the FaultDisputeGame covering the L2 block to be created
 *      and resolved (`viem/op-stack` `waitForNextGame` / `getGames`).
 *   3. Wait for the airgap (`OptimismPortal2.proofMaturityDelaySeconds`)
 *      to elapse (`viem/op-stack` `waitToFinalize`).
 *   4. Build the `bytes proof` blob in the locked ABI:
 *
 *        (
 *          bytes32 disputeGameId,
 *          bytes outputRootProof,
 *          bytes32 receiptRoot,
 *          bytes receiptProof,
 *          bytes receiptRLP,
 *          uint256 logIndex,
 *          bytes32 expectedTxHash
 *        )
 *
 * Steps (1)-(3) use `viem/op-stack` actions directly. Step (4) needs an MPT
 * proof of the receipt's inclusion in the L2 block's receipt root — viem's
 * built-in `getProof` is for storage trie proofs, not receipt trie proofs,
 * so we either:
 *   (a) build the receipt trie ourselves from `getBlockReceipts(blockHash)`
 *       and Merkle-prove the target receipt (`@ethereumjs/trie`), or
 *   (b) call an OP-Stack-specific helper if one becomes available in viem.
 *
 * Until the contract-side TODO(7x5) closures land alongside this loop, the
 * canonical path throws `NotYetImplemented` so operators don't think
 * they're claiming when they aren't. The mock path is fully wired for
 * burn-in convenience (see jinn-claim-loop-mock.ts).
 *
 * Tracked follow-up: bd `jinn-mono-7x5` Phase B-canonical.
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

export class CanonicalProofNotYetImplementedError extends Error {
  constructor(detail = 'canonical OP-Stack proof construction is not yet wired') {
    super(`[jinn-claim-loop] ${detail}. Set jinnMessengerMode='mock' for testnet burn-in.`);
    this.name = 'CanonicalProofNotYetImplementedError';
  }
}

export interface CanonicalProofInputs {
  /** L2 transaction hash that emitted the ClaimTicket. */
  l2TxHash: Hex;
  /** L2 log index of the ClaimTicket (0-indexed in the receipt). */
  l2LogIndex: number;
  /** L2 block number containing the emit tx. */
  l2BlockNumber: bigint;
}

export interface CanonicalProofClients {
  l1Client: PublicClient;
  l2Client: PublicClient;
  /** L1 OptimismPortal2 address. */
  optimismPortal: Address;
  /** L1 DisputeGameFactory address. */
  disputeGameFactory: Address;
}

/**
 * Wait until the L2 emit transaction is finalized through the canonical
 * OP-Stack pipeline (DisputeGame resolved + finality airgap elapsed) and
 * construct the `bytes proof` blob accepted by CanonicalOpStackMessenger.
 *
 * Currently throws `CanonicalProofNotYetImplementedError`. Once the
 * sibling contract closure lands (TODO(7x5) markers in
 * CanonicalOpStackMessenger.sol), this function will:
 *   - call `viem/op-stack` `waitToProve` + `waitToFinalize` to reach
 *     finality;
 *   - look up the resolved DisputeGame via `DisputeGameFactory`;
 *   - construct an `OutputRootProof` against the resolved game's commitment;
 *   - build an MPT proof of the receipt's inclusion in the L2 block's
 *     receipt root (out-of-band trie construction over
 *     `eth_getBlockReceipts`);
 *   - RLP-encode the receipt;
 *   - ABI-encode the seven-field proof tuple.
 */
export async function buildCanonicalProof(
  _clients: CanonicalProofClients,
  _inputs: CanonicalProofInputs,
): Promise<Hex> {
  throw new CanonicalProofNotYetImplementedError(
    'OP-Stack Fault Proof construction (FaultDisputeGame lookup + receipt MPT) ' +
      'not yet wired in the daemon',
  );
}

/**
 * Submit `JinnDistributor.claim(proof)` on L1 once a canonical proof has
 * been constructed. Mirrors the mock-mode submission path; idempotent at
 * the contract layer.
 *
 * Currently unreachable because `buildCanonicalProof` throws — kept as a
 * landing pad so the orchestrator wiring is complete and callers can pass
 * a real proof here as soon as the sibling contract work lands.
 */
export async function submitCanonicalClaim(
  l1Client: PublicClient,
  l1Wallet: WalletClient,
  distributor: Address,
  proof: Hex,
): Promise<Hex> {
  const account = l1Wallet.account;
  if (!account) throw new Error('L1 wallet has no account configured');

  // Local import to avoid pulling distributor ABI into mock-only code paths.
  const { JINN_DISTRIBUTOR_ABI } = await import('../earning/contracts.js');

  const { request } = await l1Client.simulateContract({
    address: distributor,
    abi: JINN_DISTRIBUTOR_ABI,
    functionName: 'claim',
    args: [proof],
    account,
  });
  return l1Wallet.writeContract(request);
}
