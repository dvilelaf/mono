// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IClaimMessenger} from "../interfaces/IClaimMessenger.sol";

/// @title CanonicalOpStackMessenger (β1, default)
/// @notice Implements `IClaimMessenger` against the canonical OP-Stack
///         message-passing flow: OptimismPortal2 + DisputeGameFactory
///         (Fault Proof). Validates that a `JinnClaimEmitter.ClaimTicket`
///         log was included in a Base / Base Sepolia block whose output
///         root has been committed to L1 via a finalized FaultDisputeGame,
///         and recovers the snapshot tuple for the JinnDistributor.
///
/// @dev    Skeleton implementation; full Fault Proof verification is
///         deferred to a follow-up under bd `jinn-mono-7x5` once Base
///         Sepolia finality (R-1) has been measured and viem op-stack
///         coverage (R-2) confirmed. The on-contract validation
///         patterns will lock during Phase D burn-in when we have real
///         proofs to test against. Until then this contract:
///         - Compiles under solc 0.8.30.
///         - Honours the `IClaimMessenger` interface exactly.
///         - Decodes the documented `bytes proof` ABI.
///         - Performs cheap, obviously-correct surface checks (empty
///           proof bytes, expected emitter address, expected event
///           selector match against the embedded `topics[0]`).
///         - Returns the embedded ClaimTicket tuple while the deeper
///           Fault Proof, MPT, and output-root checks are stubbed.
///
///         Each deferred check is tagged with a `// TODO(7x5):`
///         marker for follow-up tracking. Reverts on obviously-wrong
///         inputs (empty proof, mismatched emitter or selector).
///
///         Replay protection lives in JinnDistributor accumulators —
///         `verifyClaim` is stateless and idempotent. Reverts surface
///         malformed proofs; valid proofs may safely be replayed.
contract CanonicalOpStackMessenger is IClaimMessenger {
    /// @notice L1 OptimismPortal2 anchoring the L2 output roots
    ///         (Sepolia anchor for Base Sepolia in v0).
    address public immutable optimismPortal;

    /// @notice DisputeGameFactory used to look up FaultDisputeGames
    ///         that finalize the L2 output root being proven.
    address public immutable disputeGameFactory;

    /// @notice Address of the deployed `JinnClaimEmitter` on the
    ///         measurement chain. Logs from any other emitter address
    ///         are rejected.
    address public immutable expectedEmitter;

    /// @notice `keccak256("ClaimTicket(uint256,uint256,uint256,uint256,address,address)")` — the
    ///         topic0 of the `ClaimTicket` event. Must match the
    ///         emitter's event signature; recomputed off-chain and
    ///         pinned at deploy.
    bytes32 public immutable claimTicketTopic;

    /// @notice Decoded shape of the canonical OP-Stack proof. Mirrors
    ///         what viem's `op-stack` actions produce.
    struct OpStackProof {
        // Identifier for the resolved FaultDisputeGame (gameAtIndex
        // selector, or a packed (gameType, idx) handle — exact shape
        // locks under 7x5 once viem coverage is confirmed).
        bytes32 disputeGameId;
        // Merkle proof from the L2 output root to the dispute game's
        // committed root.
        bytes outputRootProof;
        // L2 block's transactions-receipts root (committed via the
        // output root).
        bytes32 receiptRoot;
        // Merkle-Patricia proof of the receipt's inclusion under
        // `receiptRoot`.
        bytes receiptProof;
        // RLP-encoded receipt containing the ClaimTicket log.
        bytes receiptRLP;
        // Index of the ClaimTicket log within the receipt's logs[].
        uint256 logIndex;
        // L2 transaction hash that emitted the event (for analytics
        // / log lookup; not load-bearing for validation).
        bytes32 expectedTxHash;
    }

    /// @notice Decoded ClaimTicket log payload extracted from
    ///         `receiptRLP[logIndex]`. Mirrors the indexed + non-
    ///         indexed split of the on-chain event.
    struct ClaimTicketLog {
        // address of the emitting contract (must equal expectedEmitter).
        address emitter;
        // topic0 (event selector); must equal claimTicketTopic.
        bytes32 topic0;
        // topic1 — indexed serviceId.
        bytes32 topicServiceId;
        // topic2 — indexed multisig.
        bytes32 topicMultisig;
        // topic3 — indexed claimer (analytics-only, not returned).
        bytes32 topicClaimer;
        // ABI-encoded non-indexed data:
        //   (uint256 verifiedCreations,
        //    uint256 noveltyWeightedRestorationDeliveries,
        //    uint256 evaluationDeliveryCount)
        bytes data;
    }

    constructor(
        address _optimismPortal,
        address _disputeGameFactory,
        address _expectedEmitter,
        bytes32 _claimTicketTopic
    ) {
        require(_optimismPortal != address(0), "CanonicalMessenger: portal=0");
        require(_disputeGameFactory != address(0), "CanonicalMessenger: factory=0");
        require(_expectedEmitter != address(0), "CanonicalMessenger: emitter=0");
        require(_claimTicketTopic != bytes32(0), "CanonicalMessenger: topic=0");
        optimismPortal = _optimismPortal;
        disputeGameFactory = _disputeGameFactory;
        expectedEmitter = _expectedEmitter;
        claimTicketTopic = _claimTicketTopic;
    }

    /// @inheritdoc IClaimMessenger
    function verifyClaim(bytes calldata proof)
        external
        view
        override
        returns (
            uint256 serviceId,
            uint256 verifiedCreations,
            uint256 noveltyWeightedRestorationDeliveries,
            uint256 evaluationDeliveryCount,
            address multisig
        )
    {
        require(proof.length > 0, "CanonicalMessenger: empty proof");

        // Decode the outer proof envelope. The inner ClaimTicketLog
        // is appended so the contract can return values today; once
        // `7x5` lands the receipt-MPT logic, the log will be derived
        // from `receiptRLP[logIndex]` rather than passed in.
        (OpStackProof memory p, ClaimTicketLog memory log) =
            abi.decode(proof, (OpStackProof, ClaimTicketLog));

        // Surface checks that are cheap and obviously correct today.
        require(log.emitter == expectedEmitter, "CanonicalMessenger: bad emitter");
        require(log.topic0 == claimTicketTopic, "CanonicalMessenger: bad selector");

        // TODO(7x5): Look up the dispute game via
        //   IDisputeGameFactory(disputeGameFactory).gameAtIndex(...)
        // and confirm:
        //   1. game.status() == GameStatus.DEFENDER_WINS
        //   2. block.timestamp >= game.resolvedAt() + airgap window
        //   3. game.gameType() is the canonical Fault Proof type
        //      authorized for OptimismPortal2 finality
        // Reject otherwise. Use `p.disputeGameId` to address the game.
        _todoVerifyDisputeGame(p.disputeGameId);

        // TODO(7x5): Validate `p.outputRootProof` against the dispute
        // game's committed L2 output root. The output root is a hash
        // over (stateRoot, withdrawalsRoot, blockHash, ...); the
        // ClaimTicket receipt lives under the L2 block whose receipt
        // root is `p.receiptRoot`.
        _todoVerifyOutputRoot(p.outputRootProof, p.receiptRoot);

        // TODO(7x5): Validate `p.receiptProof` as a Merkle-Patricia
        // proof of `p.receiptRLP` under `p.receiptRoot`. Decode the
        // receipt and pull out `logs[p.logIndex]`. Compare emitter +
        // topics + data against `log` rather than trusting the
        // separately-passed struct.
        _todoVerifyReceiptInclusion(p.receiptProof, p.receiptRoot, p.receiptRLP, p.logIndex);

        // TODO(7x5): Once the receipt-derived log is the source of
        // truth, drop the separate `ClaimTicketLog` field of the
        // proof and recover all fields from `receiptRLP[logIndex]`.
        // For now we trust the embedded struct because the deeper
        // checks above are stubbed.

        // Decode the ClaimTicket payload. This shape matches
        // `JinnClaimEmitter.ClaimTicket`:
        //   topic1 = serviceId (uint256, indexed)
        //   topic2 = multisig  (address, indexed)
        //   topic3 = claimer   (address, indexed) — discarded; analytics-only
        //   data    = abi.encode(verifiedCreations, novelty, evalDelivery)
        serviceId = uint256(log.topicServiceId);
        multisig = address(uint160(uint256(log.topicMultisig)));
        (
            verifiedCreations,
            noveltyWeightedRestorationDeliveries,
            evaluationDeliveryCount
        ) = abi.decode(log.data, (uint256, uint256, uint256));
    }

    // ---------------------------------------------------------------
    // Internal stubs — replaced under bd `jinn-mono-7x5` once Base
    // Sepolia finality is measured and viem op-stack coverage is
    // confirmed. They are `pure` placeholders that revert only on
    // the trivially-malformed inputs the outer checks cannot catch.
    // ---------------------------------------------------------------

    function _todoVerifyDisputeGame(bytes32 disputeGameId) internal pure {
        // TODO(7x5): real DisputeGameFactory lookup + finality check.
        require(disputeGameId != bytes32(0), "CanonicalMessenger: bad gameId");
    }

    function _todoVerifyOutputRoot(bytes memory outputRootProof, bytes32 receiptRoot)
        internal
        pure
    {
        // TODO(7x5): real Merkle validation against the dispute
        // game's committed output root.
        require(outputRootProof.length > 0, "CanonicalMessenger: bad outputRootProof");
        require(receiptRoot != bytes32(0), "CanonicalMessenger: bad receiptRoot");
    }

    function _todoVerifyReceiptInclusion(
        bytes memory receiptProof,
        bytes32 receiptRoot,
        bytes memory receiptRLP,
        uint256 logIndex
    ) internal pure {
        // TODO(7x5): real MPT validation of receiptRLP under
        // receiptRoot, then RLP decode + logs[logIndex] extraction.
        require(receiptProof.length > 0, "CanonicalMessenger: bad receiptProof");
        require(receiptRoot != bytes32(0), "CanonicalMessenger: bad receiptRoot");
        require(receiptRLP.length > 0, "CanonicalMessenger: bad receiptRLP");
        // logIndex of 0 is legal; nothing to assert beyond shape.
        logIndex;
    }
}
