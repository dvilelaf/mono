// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IClaimMessenger} from "../interfaces/IClaimMessenger.sol";
import {RLP} from "@openzeppelin/contracts/utils/RLP.sol";
import {TrieProof} from "@openzeppelin/contracts/utils/cryptography/TrieProof.sol";
import {Memory} from "@openzeppelin/contracts/utils/Memory.sol";

/// @notice Minimal interface to OP-Stack `DisputeGameFactory`.
///         `gameAtIndex` returns the canonical handle (gameType, timestamp,
///         proxy) for the FaultDisputeGame stored at that ordinal.
interface IDisputeGameFactory {
    function gameAtIndex(uint256 _index)
        external
        view
        returns (uint32 gameType_, uint64 timestamp_, address proxy_);
}

/// @notice Minimal interface to OP-Stack `FaultDisputeGame`. The proxy
///         returned by `gameAtIndex` MUST satisfy these selectors —
///         they are part of the canonical Bedrock contracts and have
///         been stable since the Fault Proof launch.
///
///         `status()` returns the `GameStatus` enum:
///             0 = IN_PROGRESS
///             1 = CHALLENGER_WINS
///             2 = DEFENDER_WINS
///         `gameType()` returns the registered fault-game type.
///         `resolvedAt()` returns the L1 timestamp at which `resolve()`
///         locked the status.
///         `rootClaim()` returns the proposer's L2 output root that
///         the game adjudicates.
interface IFaultDisputeGame {
    function status() external view returns (uint8);
    function gameType() external view returns (uint32);
    function resolvedAt() external view returns (uint64);
    function rootClaim() external view returns (bytes32);
}

/// @notice Minimal interface to OP-Stack `OptimismPortal2`. Only the
///         airgap delay is read; the portal address is otherwise pinned
///         at deploy for documentation and future expansion.
interface IOptimismPortal2 {
    function proofMaturityDelaySeconds() external view returns (uint256);
}

/// @title CanonicalOpStackMessenger (β1, default)
/// @notice Implements `IClaimMessenger` against the canonical OP-Stack
///         message-passing flow: OptimismPortal2 + DisputeGameFactory
///         (Fault Proof). Validates that a `JinnClaimEmitter.ClaimTicket`
///         log was included in a Base / Base Sepolia block whose output
///         root has been committed to L1 via a finalized FaultDisputeGame,
///         and recovers the snapshot tuple for the JinnDistributor.
///
/// @dev    Full Fault Proof verification — bd `jinn-mono-7x5`. The
///         proof envelope decodes `(disputeGameId, outputRootProof,
///         receiptRoot, receiptProof, receiptRLP, logIndex, txIndex,
///         expectedTxHash)` and validates each step before extracting
///         the ClaimTicket payload.
///
///         Verification order — each layer authorises the next:
///         1. DisputeGameFactory lookup. `disputeGameId` indexes a
///            FaultDisputeGame whose `status() == DEFENDER_WINS`,
///            `gameType() == authorisedGameType`, and whose
///            `resolvedAt() + airgap <= block.timestamp` (the
///            OptimismPortal2 finality airgap).
///         2. Output-root commitment. The proposer's `rootClaim()` MUST
///            equal `keccak256(version || stateRoot ||
///            messagePasserStorageRoot || latestBlockHash)`. Then the
///            L2 block header RLP MUST hash to `latestBlockHash`, and
///            its index-5 field MUST equal the `receiptRoot` we will
///            prove against.
///         3. Receipt-MPT inclusion. `receiptRLP` is the leaf value
///            under `receiptRoot` for key `RLP(txIndex)`. Decode the
///            receipt (typed envelope-aware) and read
///            `logs[logIndex]`.
///         4. Log shape. The proven log's address must equal
///            `expectedEmitter` and `topics[0]` must equal
///            `claimTicketTopic` (the ClaimTicket selector).
///         5. Decode. Indexed topics yield `serviceId` and `multisig`;
///            the data blob ABI-decodes into the three counters.
///
///         Reverts on every failure mode with descriptive errors. No
///         state writes — replay protection lives in JinnDistributor's
///         monotonic accumulators per `IClaimMessenger` NatSpec.
contract CanonicalOpStackMessenger is IClaimMessenger {
    using RLP for *;
    using Memory for *;

    /// @notice L1 OptimismPortal2 anchoring the L2 output roots
    ///         (Sepolia anchor for Base Sepolia in v0). Read at proof
    ///         time for the airgap delay (`proofMaturityDelaySeconds`).
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

    /// @notice Authorised FaultDisputeGame type (e.g., the Cannon /
    ///         permissionless game type registered with
    ///         OptimismPortal2). Games of any other `gameType()` are
    ///         rejected even if they happen to resolve DEFENDER_WINS.
    uint32 public immutable authorisedGameType;

    /// @notice Decoded shape of the canonical OP-Stack proof. Mirrors
    ///         what viem's `op-stack` actions produce.
    struct OpStackProof {
        // Index into DisputeGameFactory.gameAtIndex(...) addressing the
        // FaultDisputeGame that finalized the L2 block's output root.
        bytes32 disputeGameId;
        // ABI-encoded
        // (bytes32 version, bytes32 stateRoot, bytes32 messagePasserStorageRoot,
        //  bytes32 latestBlockHash, bytes blockHeaderRLP)
        // — all four scalars feed into the OP-Stack output-root preimage,
        // and `blockHeaderRLP` carries the L2 block header so its
        // receiptRoot field can be tied back to `receiptRoot`.
        bytes outputRootProof;
        // L2 block's transactions-receipts root (committed via the L2
        // block header inside `outputRootProof`). Carried explicitly so
        // the MPT call site is self-describing.
        bytes32 receiptRoot;
        // Merkle-Patricia proof of the receipt's inclusion under
        // `receiptRoot` — array of RLP-encoded MPT nodes from root to leaf.
        bytes[] receiptProof;
        // Either the legacy receipt RLP (`rlp([status, cumGas, bloom, logs])`)
        // or the typed receipt (`type_byte || rlp([...])`) — exactly the
        // bytes that live as the leaf value at MPT key `rlp(txIndex)`.
        bytes receiptRLP;
        // Index of the ClaimTicket log within the receipt's logs[].
        uint256 logIndex;
        // Transaction index within the L2 block — the MPT key is
        // `RLP(txIndex)`.
        uint256 txIndex;
        // L2 transaction hash that emitted the event (analytics-only;
        // not load-bearing for validation).
        bytes32 expectedTxHash;
    }

    /// @notice The output-root proof preimage carried in
    ///         `OpStackProof.outputRootProof`. Recomputed via
    ///         `keccak256(abi.encodePacked(version, stateRoot,
    ///         messagePasserStorageRoot, latestBlockHash))` and
    ///         compared against the dispute game's `rootClaim()`.
    struct OutputRootProof {
        bytes32 version;
        bytes32 stateRoot;
        bytes32 messagePasserStorageRoot;
        bytes32 latestBlockHash;
        bytes blockHeaderRLP;
    }

    // ---------- Errors ----------
    error InvalidDisputeGame();
    error GameNotResolved();
    error AirgapNotElapsed();
    error WrongGameType();
    error OutputRootMismatch();
    error BlockHashMismatch();
    error MalformedBlockHeader();
    error ReceiptRootMismatch();
    error ReceiptMPTInvalid();
    error MalformedReceipt();
    error LogIndexOutOfBounds();
    error WrongLogEmitter();
    error WrongLogTopic();
    error MalformedLog();

    // ---------- Constants ----------

    /// @dev L2 block header field ordering per Ethereum yellow paper.
    ///      `receiptsRoot` is at index 5:
    ///         0 parentHash, 1 uncleHash, 2 coinbase, 3 stateRoot,
    ///         4 transactionsRoot, 5 receiptsRoot, ...
    uint256 private constant BLOCK_HEADER_RECEIPTS_ROOT_INDEX = 5;

    /// @dev OP-Stack `GameStatus` enum value for "defender wins". See
    ///      `IFaultDisputeGame.status()` documentation above.
    uint8 private constant GAME_STATUS_DEFENDER_WINS = 2;

    constructor(
        address _optimismPortal,
        address _disputeGameFactory,
        address _expectedEmitter,
        bytes32 _claimTicketTopic,
        uint32 _authorisedGameType
    ) {
        require(_optimismPortal != address(0), "CanonicalMessenger: portal=0");
        require(_disputeGameFactory != address(0), "CanonicalMessenger: factory=0");
        require(_expectedEmitter != address(0), "CanonicalMessenger: emitter=0");
        require(_claimTicketTopic != bytes32(0), "CanonicalMessenger: topic=0");
        optimismPortal = _optimismPortal;
        disputeGameFactory = _disputeGameFactory;
        expectedEmitter = _expectedEmitter;
        claimTicketTopic = _claimTicketTopic;
        authorisedGameType = _authorisedGameType;
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
        OpStackProof memory p = abi.decode(proof, (OpStackProof));

        // 1. Look up the dispute game; require finalized DEFENDER_WINS.
        bytes32 l2OutputRoot = _verifyDisputeGame(p.disputeGameId);

        // 2. Recompute the OP-Stack output-root preimage and tie it to
        //    the L2 block header → receiptRoot.
        bytes32 verifiedReceiptRoot = _verifyOutputRoot(p.outputRootProof, l2OutputRoot);
        if (verifiedReceiptRoot != p.receiptRoot) revert ReceiptRootMismatch();

        // 3. MPT-verify the receipt and pull out the target log.
        (address logEmitter, bytes32[] memory topics, bytes memory data) =
            _verifyReceiptInclusion(p.receiptRoot, p.receiptProof, p.receiptRLP, p.logIndex, p.txIndex);

        // 4. Log shape — emitter + selector must match the deploy-time
        //    constants, otherwise an arbitrary contract on the L2 could
        //    mint our event signature.
        if (logEmitter != expectedEmitter) revert WrongLogEmitter();
        if (topics.length < 4) revert MalformedLog();
        if (topics[0] != claimTicketTopic) revert WrongLogTopic();

        // 5. Decode. ClaimTicket layout:
        //   topic[1] = serviceId (uint256, indexed)
        //   topic[2] = multisig  (address, indexed)
        //   topic[3] = claimer   (address, indexed) — analytics only
        //   data     = abi.encode(verifiedCreations,
        //                         noveltyWeightedRestorationDeliveries,
        //                         evaluationDeliveryCount)
        serviceId = uint256(topics[1]);
        multisig = address(uint160(uint256(topics[2])));
        (
            verifiedCreations,
            noveltyWeightedRestorationDeliveries,
            evaluationDeliveryCount
        ) = abi.decode(data, (uint256, uint256, uint256));
    }

    // ---------------------------------------------------------------
    // Internal verification — each step reverts on the malformations
    // §4 of the v0 threat model lists. Returns the value the next step
    // needs so verifyClaim can chain them without re-decoding.
    // ---------------------------------------------------------------

    /// @dev Phase 1 — DisputeGameFactory lookup + finality check.
    /// @return The L2 output root the proposer's claim resolves to.
    function _verifyDisputeGame(bytes32 disputeGameId) internal view returns (bytes32) {
        if (disputeGameId == bytes32(0)) revert InvalidDisputeGame();
        uint256 index = uint256(disputeGameId);

        (uint32 gameType, , address proxy) =
            IDisputeGameFactory(disputeGameFactory).gameAtIndex(index);
        if (proxy == address(0)) revert InvalidDisputeGame();
        if (gameType != authorisedGameType) revert WrongGameType();

        IFaultDisputeGame game = IFaultDisputeGame(proxy);
        // Cross-check the proxy's self-reported gameType — the factory
        // record alone is not load-bearing because games may be rebuilt;
        // matching both layers closes the substitution attack.
        if (game.gameType() != authorisedGameType) revert WrongGameType();
        if (game.status() != GAME_STATUS_DEFENDER_WINS) revert GameNotResolved();

        uint256 resolvedAt = uint256(game.resolvedAt());
        uint256 airgap = IOptimismPortal2(optimismPortal).proofMaturityDelaySeconds();
        if (resolvedAt == 0 || block.timestamp < resolvedAt + airgap) {
            revert AirgapNotElapsed();
        }
        return game.rootClaim();
    }

    /// @dev Phase 2 — OP-Stack output-root reconstruction. Confirms
    ///      `outputRoot == keccak(version, stateRoot, msgPasserRoot,
    ///      blockHash)` and that the carried block header hashes to
    ///      `blockHash`, then exposes its `receiptsRoot` field.
    function _verifyOutputRoot(bytes memory outputRootProof, bytes32 l2OutputRoot)
        internal
        pure
        returns (bytes32 verifiedReceiptRoot)
    {
        OutputRootProof memory orp = abi.decode(outputRootProof, (OutputRootProof));

        bytes32 recomputed = keccak256(
            abi.encodePacked(
                orp.version,
                orp.stateRoot,
                orp.messagePasserStorageRoot,
                orp.latestBlockHash
            )
        );
        if (recomputed != l2OutputRoot) revert OutputRootMismatch();

        if (orp.blockHeaderRLP.length == 0) revert MalformedBlockHeader();
        if (keccak256(orp.blockHeaderRLP) != orp.latestBlockHash) revert BlockHashMismatch();

        // Pull receiptsRoot (index 5) from the RLP-decoded header list.
        Memory.Slice[] memory headerFields = orp.blockHeaderRLP.decodeList();
        if (headerFields.length <= BLOCK_HEADER_RECEIPTS_ROOT_INDEX) revert MalformedBlockHeader();
        verifiedReceiptRoot = headerFields[BLOCK_HEADER_RECEIPTS_ROOT_INDEX].readBytes32();
    }

    /// @dev Phase 3 — MPT inclusion of the receipt + log extraction.
    function _verifyReceiptInclusion(
        bytes32 receiptRoot,
        bytes[] memory receiptProof,
        bytes memory receiptRLP,
        uint256 logIndex,
        uint256 txIndex
    )
        internal
        pure
        returns (address logEmitter, bytes32[] memory topics, bytes memory data)
    {
        if (receiptRoot == bytes32(0)) revert ReceiptMPTInvalid();
        if (receiptRLP.length == 0) revert MalformedReceipt();
        if (receiptProof.length == 0) revert ReceiptMPTInvalid();

        // MPT key = RLP(txIndex). For txIndex == 0 the canonical RLP is
        // `0x80` (empty bytes); for non-zero scalars RLP strips leading
        // zeroes per Ethereum yellow paper §4.3.
        bytes memory mptKey = RLP.encode(txIndex);

        // Hard-revert (not error-flag) variant; lets us surface MPT
        // errors as ReceiptMPTInvalid uniformly to callers.
        bool ok = TrieProof.verify(receiptRLP, receiptRoot, mptKey, receiptProof);
        if (!ok) revert ReceiptMPTInvalid();

        // Strip typed-tx envelope if present. EIP-2718 receipts in the
        // trie are stored as `type_byte || rlp([...])` whenever the
        // tx type is non-zero. The first byte of an RLP list payload is
        // always >= 0xC0, so any first byte < 0xC0 (specifically < 0x80
        // per the spec) is the type discriminator.
        bytes memory payload;
        if (uint8(receiptRLP[0]) < 0x80) {
            // EIP-2718 typed receipt; drop the leading byte.
            uint256 plen = receiptRLP.length - 1;
            payload = new bytes(plen);
            for (uint256 i = 0; i < plen; ++i) payload[i] = receiptRLP[i + 1];
        } else {
            payload = receiptRLP;
        }

        // Receipt RLP layout: [postStateOrStatus, cumulativeGasUsed,
        //                      logsBloom, logs]
        Memory.Slice[] memory receiptFields = payload.decodeList();
        if (receiptFields.length != 4) revert MalformedReceipt();

        // Logs is itself an RLP list of [address, topics[], data].
        Memory.Slice[] memory logs = receiptFields[3].readList();
        if (logIndex >= logs.length) revert LogIndexOutOfBounds();

        Memory.Slice[] memory targetLog = logs[logIndex].readList();
        if (targetLog.length != 3) revert MalformedLog();

        logEmitter = targetLog[0].readAddress();
        Memory.Slice[] memory topicSlices = targetLog[1].readList();
        topics = new bytes32[](topicSlices.length);
        for (uint256 i = 0; i < topicSlices.length; ++i) {
            topics[i] = topicSlices[i].readBytes32();
        }
        data = targetLog[2].readBytes();
    }
}
