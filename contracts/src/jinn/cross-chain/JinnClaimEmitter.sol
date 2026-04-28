// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Minimal interface for the V2 restoration activity checker.
///         Reads the two restoration-side counters that drive JINN
///         minting on the JINN chain.
///         - `verifiedCreations(multisig)` is added by the `pwg`
///           extension to V2 (creator credit, ε-gated by Hamming).
///         - `noveltyWeightedCounts(multisig)` is the existing public
///           state on V2 (delivery credit, novelty-weighted).
interface IRestorationActivityCheckerV2 {
    function verifiedCreations(address multisig) external view returns (uint256);
    function noveltyWeightedCounts(address multisig) external view returns (uint256);
}

/// @notice Minimal interface for the V2 JinnRouter. Reads the
///         evaluation-delivery counter, ungated per Q1.5
///         (deterministic-eval reasoning).
interface IJinnRouterV2 {
    function evaluationDeliveryCount(address multisig) external view returns (uint256);
}

/// @notice Minimal interface for the OLAS ServiceRegistry on Base.
///         `mapServices` returns the canonical 7-field tuple used by
///         existing OLAS contracts (MechMarketplace, RecoveryModule,
///         StakingManager). The function selector matches the
///         deployed registry; we only need the second field
///         (multisig).
interface IServiceRegistry {
    function mapServices(uint256 serviceId)
        external
        view
        returns (
            uint96 securityDeposit,
            address multisig,
            bytes32 configHash,
            uint32 threshold,
            uint32 maxNumAgentInstances,
            uint32 numAgentInstances,
            uint8 state
        );
}

/// @title JinnClaimEmitter
/// @notice Stateless event emitter on Base / Base Sepolia. Reads three
///         monotonic counters across two source contracts (V2 checker
///         and V2 router) plus the service multisig from the OLAS
///         ServiceRegistry, and emits a `ClaimTicket` carrying the
///         snapshot. The companion `IClaimMessenger` on the JINN
///         chain (Ethereum / Sepolia) validates the resulting log via
///         a canonical OP-Stack proof and feeds the recovered values
///         to the JinnDistributor.
///
/// @dev    No storage, no admin, no upgrade path. Permissionless:
///         anyone can call `emitClaim` for any serviceId. Spamming
///         the event costs the caller gas; doesn't affect the
///         on-chain values being read. Replay protection lives in
///         JinnDistributor accumulators on the JINN chain.
contract JinnClaimEmitter {
    IRestorationActivityCheckerV2 public immutable checker;
    IJinnRouterV2 public immutable router;
    IServiceRegistry public immutable serviceRegistry;

    /// @notice Snapshot of the three counter values for `serviceId`
    ///         at emit time. Carries `multisig` so the JINN-chain
    ///         distributor can route the operator-share mint, and
    ///         `claimer` for analytics (does not gate anything).
    event ClaimTicket(
        uint256 indexed serviceId,
        uint256 verifiedCreations,
        uint256 noveltyWeightedRestorationDeliveries,
        uint256 evaluationDeliveryCount,
        address indexed multisig,
        address indexed claimer
    );

    constructor(address _checker, address _router, address _registry) {
        require(_checker != address(0), "JinnClaimEmitter: checker=0");
        require(_router != address(0), "JinnClaimEmitter: router=0");
        require(_registry != address(0), "JinnClaimEmitter: registry=0");
        checker = IRestorationActivityCheckerV2(_checker);
        router = IJinnRouterV2(_router);
        serviceRegistry = IServiceRegistry(_registry);
    }

    /// @notice Emit a snapshot ClaimTicket for the given service. All
    ///         three counter reads happen in one transaction; the
    ///         event captures their values at one block.
    /// @param serviceId OLAS service id whose multisig owns the
    ///                  counters being snapshotted.
    function emitClaim(uint256 serviceId) external {
        (, address multisig, , , , , ) = serviceRegistry.mapServices(serviceId);
        require(multisig != address(0), "JinnClaimEmitter: unknown service");
        emit ClaimTicket(
            serviceId,
            checker.verifiedCreations(multisig),
            checker.noveltyWeightedCounts(multisig),
            router.evaluationDeliveryCount(multisig),
            multisig,
            msg.sender
        );
    }
}
