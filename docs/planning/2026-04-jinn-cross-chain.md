# Jinn v0 Cross-Chain Spec — JinnClaimEmitter + IClaimMessenger + CanonicalOpStackMessenger + MockMessenger

> Status: **Locked 2026-04-28**
> Date: 2026-04-28
> Branch: `jinn-mono/jinn-mono-1bo`
> Phase A2 of the Jinn v0 MVI implementation plan
> bd task: `jinn-mono-l6b`
> Reference: `docs/planning/2026-04-jinn-mvi-on-olas.md` (proposal, on `main`) +
> `docs/planning/2026-04-olas-staking-reward-semantics.md` (A0 v3, this branch) +
> `docs/security/2026-04-v2-checker-audit.md` (V2 audit, this branch)

## Context

The v0 architecture (proposal §9) ships JINN token + governance on
Ethereum (Sepolia for testnet) with measurement on Base (Base
Sepolia for testnet). JINN minting therefore needs a cross-chain
flow: an event on Base proves real protocol work, and a
verification on Ethereum mints JINN against it.

This spec locks the contract interfaces, event shapes, and proof
mechanics for that flow under the architectural decisions from A0
(Architecture B with ε creation gating; B-multi for per-channel
weights on the distributor; eval creations dropped; C4/C1 audit
fixes bundled into v0 testnet).

## Architectural overview (recap)

**Three counters drive JINN minting**, all monotonic, all sourced
from the V2 activity checker (extended per `pwg`) on Base:

- `checker.verifiedCreations(multisig)` — restoration creation
  credit. Incremented (per ε) only when the creator's intent gets
  a delivery that passes Hamming. Lives on the V2 checker after
  `pwg` extension.
- `checker.noveltyWeightedCounts(multisig)` — restoration delivery
  credit, novelty-weighted. Lives on the V2 checker today.
- `router.evaluationDeliveryCount(multisig)` — eval delivery
  credit, ungated (per Q1.5; deterministic evals). Lives on the
  V2 router as public state.

JinnClaimEmitter on Base reads all three (across two contracts —
checker for the first two, router for the third), emits a
ClaimTicket event with the snapshot. CanonicalOpStackMessenger on
Ethereum validates the event via canonical OP-Stack proof, recovers
the values, hands them to JinnDistributor for minting.

## Event: `ClaimTicket`

Emitted by `JinnClaimEmitter` on Base / Base Sepolia. Carries
everything the Ethereum-side distributor needs.

```solidity
event ClaimTicket(
    uint256 indexed serviceId,
    uint256 verifiedCreations,
    uint256 noveltyWeightedRestorationDeliveries,
    uint256 evaluationDeliveryCount,
    address indexed multisig,
    address indexed claimer
);
```

Fields:
- `serviceId` — OLAS service id; indexed for log filtering.
- `verifiedCreations` — current value of
  `checker.verifiedCreations(multisig)` at emit time.
- `noveltyWeightedRestorationDeliveries` — current value of
  `checker.noveltyWeightedCounts(multisig)` at emit time.
- `evaluationDeliveryCount` — current value of
  `router.evaluationDeliveryCount(multisig)` at emit time.
- `multisig` — service multisig (Safe). Indexed; the ultimate
  recipient of the operator-share JINN mint on Ethereum.
- `claimer` — `msg.sender` at emit time. Indexed for analytics
  but doesn't gate anything — the emitter is permissionless.

The values are 256-bit unsigned. Under B-multi the distributor
applies channel weights (`wCreation`, `wRestorationDelivery`,
`wEvaluationDelivery`) to the snapshot at mint time. The event
itself is unweighted — the source of truth for what was measured
on Base at the time of emission.

## Contract: `JinnClaimEmitter`

Deploys on Base / Base Sepolia. ~30 lines stateless.

```solidity
contract JinnClaimEmitter {
    IRestorationActivityCheckerV2 public immutable checker;
    IJinnRouterV2 public immutable router;
    IServiceRegistry public immutable serviceRegistry;

    event ClaimTicket(
        uint256 indexed serviceId,
        uint256 verifiedCreations,
        uint256 noveltyWeightedRestorationDeliveries,
        uint256 evaluationDeliveryCount,
        address indexed multisig,
        address indexed claimer
    );

    constructor(address _checker, address _router, address _registry) {
        checker = IRestorationActivityCheckerV2(_checker);
        router = IJinnRouterV2(_router);
        serviceRegistry = IServiceRegistry(_registry);
    }

    function emitClaim(uint256 serviceId) external {
        address multisig = serviceRegistry.mapServices(serviceId).multisig;
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
```

Properties:
- **Stateless.** No storage, no admin, no upgrade path needed.
- **Permissionless.** Anyone can call `emitClaim` for any
  serviceId. Spamming the event costs the caller gas; doesn't
  affect the on-chain values being read.
- **Snapshot atomicity.** All three counter reads happen in one
  transaction; the event captures their values at one block.
- **Three contract reads:** checker (×2), router (×1), registry
  (×1). Marginal gas cost, single tx.

## Interface: `IClaimMessenger`

Lives on Ethereum / Sepolia. The interface every messenger
implementation must satisfy. Stateless / idempotent — replay
protection is the JinnDistributor's job, not the messenger's.

```solidity
interface IClaimMessenger {
    /// @notice Validates a cross-chain proof and recovers the
    ///         ClaimTicket parameters that were emitted on the
    ///         measurement chain.
    /// @dev Implementations MUST be stateless / idempotent. No
    ///      nonce tracking, no seen-proof registry. Replay
    ///      protection lives in the JinnDistributor's per-service
    ///      monotonic accumulators.
    /// @param proof Opaque blob, format defined by implementation
    ///              (canonical OP-Stack message proof, OP Succinct
    ///              ZK proof, third-party bridge attestation, or
    ///              MockMessenger fixture pointer).
    /// @return serviceId Recovered service id from the ClaimTicket.
    /// @return verifiedCreations Recovered counter value.
    /// @return noveltyWeightedRestorationDeliveries Recovered counter.
    /// @return evaluationDeliveryCount Recovered counter.
    /// @return multisig Recovered service multisig address.
    function verifyClaim(bytes calldata proof)
        external
        view
        returns (
            uint256 serviceId,
            uint256 verifiedCreations,
            uint256 noveltyWeightedRestorationDeliveries,
            uint256 evaluationDeliveryCount,
            address multisig
        );
}
```

Future messenger implementations (β2 OP Succinct, β3 Hyperlane /
LayerZero) MUST satisfy this interface. The opaque `bytes proof`
parameter accommodates any format.

## Contract: `CanonicalOpStackMessenger` (β1, default)

Deploys on Ethereum / Sepolia. ~120–150 lines. Implements
`IClaimMessenger` against the canonical OP-Stack message-passing
flow.

### Proof shape

The proof contains a Base-chain transaction receipt + the canonical
output-root commitment chain to L1, plus the FaultDisputeGame
reference for finality.

Concrete `bytes proof` ABI:
```
(
    bytes32 disputeGameId,           // Identifier for the resolved game
    bytes outputRootProof,           // Merkle proof to the L2 output root
    bytes32 receiptRoot,             // L2 block's receipt root
    bytes receiptProof,              // Merkle-Patricia proof of the receipt
    bytes receiptRLP,                // RLP-encoded receipt
    uint256 logIndex,                // Index of the ClaimTicket log in the receipt
    bytes32 expectedTxHash           // L2 tx that emitted the event
)
```

This format is exactly what viem's `op-stack` actions can
construct. The messenger validates each piece in order:

1. **DisputeGame is resolved + finalized.** Look up
   `DisputeGameFactory.gameAtIndex(...)` → `FaultDisputeGame`.
   Confirm the game's resolution status is `DEFENDER_WINS` and the
   finality window has elapsed. Reject otherwise.
2. **Output root matches.** The dispute game commits to a specific
   L2 output root. Validate `outputRootProof` against it.
3. **Receipt is included in the L2 block.** Validate `receiptProof`
   against `receiptRoot` (which itself is committed via the output
   root). Decode `receiptRLP`.
4. **The receipt contains the ClaimTicket log.** Look up
   `receipt.logs[logIndex]`. Verify `topic[0] == ClaimTicket
   selector` and the emitter address matches the deployed
   `JinnClaimEmitter` on Base.
5. **Decode the log.** Extract `serviceId`, `verifiedCreations`,
   `noveltyWeightedRestorationDeliveries`,
   `evaluationDeliveryCount`, `multisig`, `claimer`.
6. **Return** the recovered values.

If any step fails, the messenger reverts. No state writes; no
seen-proof registry. The same proof can be submitted multiple
times — the JinnDistributor handles replay via accumulators.

### Constants set at deploy

- L1 OptimismPortal2 address (Sepolia anchor for Base Sepolia).
- DisputeGameFactory address.
- Expected JinnClaimEmitter address on Base (so we reject logs
  emitted by some impostor contract that happens to use the same
  event signature).
- Expected `ClaimTicket` topic[0] (event signature hash).

### Trust assumptions

- L1 settlement (Ethereum block production + finality).
- OP-Stack Fault Proof correctness (challenge period elapsed, no
  successful counter-claim during the window).
- No additional trust delta on top of L1.

### Latency

**Mainnet:** ~7-day Fault Proof challenge period.
**Base Sepolia:** TBD — see "Open research items" below. Likely
seconds to hours per Optimism Sepolia precedent, but Base Sepolia's
specific config has not been measured.

## Contract: `MockMessenger` (testnet/dev only)

Deploys only on Sepolia for CI / dev / burn-in convenience. NEVER
on mainnet. ~20 lines.

```solidity
contract MockMessenger is IClaimMessenger {
    address public owner;

    struct Fixture {
        uint256 verifiedCreations;
        uint256 noveltyWeightedRestorationDeliveries;
        uint256 evaluationDeliveryCount;
        address multisig;
    }
    mapping(uint256 => Fixture) public fixtures;

    constructor(address _owner) {
        owner = _owner;
    }

    function setFixture(uint256 serviceId, Fixture calldata f) external {
        require(msg.sender == owner, "MockMessenger: not owner");
        fixtures[serviceId] = f;
    }

    function verifyClaim(bytes calldata proof)
        external view returns (
            uint256 serviceId,
            uint256 verifiedCreations,
            uint256 noveltyWeightedRestorationDeliveries,
            uint256 evaluationDeliveryCount,
            address multisig
        )
    {
        serviceId = abi.decode(proof, (uint256));
        Fixture memory f = fixtures[serviceId];
        require(f.multisig != address(0), "MockMessenger: no fixture");
        return (
            serviceId,
            f.verifiedCreations,
            f.noveltyWeightedRestorationDeliveries,
            f.evaluationDeliveryCount,
            f.multisig
        );
    }
}
```

Properties:
- **Insecure by design.** Owner can set any fixture and mint
  arbitrary JINN through the distributor. **NEVER deploy on
  mainnet.**
- **Permissioned setFixture.** Only the deployer (or a
  test-fixture address) writes fixtures. `verifyClaim` is read-only
  for anyone.
- **Permanent or testnet-only?** Pending finality research. If
  Base Sepolia's challenge period is short enough for canonical
  burn-in, MockMessenger remains a CI / dev-only convenience. If
  too long, MockMessenger becomes the active messenger on Sepolia
  during burn-in, with at least one canonical-path test before
  Phase D completes.

## Operator UX (two-tx flow)

Operators interact with the cross-chain flow via the daemon.
End-to-end:

1. **Operator does protocol work.** Posts intents
   (`createRestorationJob`), claims deliveries (`claimDelivery`)
   for restorations + evaluations. Each call increments router
   counters or, via the V2 checker, the verified-work counters.

2. **Daemon emits ClaimTicket on Base.** Periodically (e.g., once
   per hour or once per day, configurable) the daemon calls
   `JinnClaimEmitter.emitClaim(serviceId)` on Base / Base Sepolia.
   Snapshot is recorded in the event.

3. **Daemon waits for L2→L1 finality.** The dispute game must
   resolve and the challenge period must elapse. Mainnet: ~7
   days. Testnet: TBD.

4. **Daemon constructs proof.** Once the snapshot's L2 block is
   finalized, the daemon (via viem's `op-stack` helpers) builds
   the `bytes proof` blob.

5. **Daemon submits proof on Sepolia.** Calls
   `JinnDistributor.claim(proof)`. Distributor calls
   `messenger.verifyClaim(proof)`, recovers the snapshot, applies
   weights + ratios, mints to operator multisig + DAO Timelock.

Per Q-X4: the daemon submits both transactions by default. The
redeem step is permissionless — a relayer can submit the proof on
the operator's behalf if needed. `serviceId` and the multisig are
captured in the event, so JINN flows to the right destination
regardless of who submits the redeem tx.

## Replay protection

Lives entirely in the JinnDistributor's per-service accumulators.
Same proof submitted twice:

1. First submission: messenger validates, returns
   `(serviceId=42, vCreations=10, vRestoration=20, evalDelivery=5, multisig=0xMS)`.
   Distributor computes weighted snapshot, applies ratios, computes
   `owedOperator = entitledOperator - totalClaimedOperator[42]` =
   some positive value. Mints. Updates accumulators.
2. Second submission of same proof: messenger validates the same
   proof and returns the same tuple. Distributor recomputes — but
   `totalClaimedOperator[42]` is now equal to entitled, so
   `owedOperator = 0`. No mint. Accumulator unchanged.

The accumulator math handles arbitrary submission orders. Every
proof commits to a specific snapshot; the distributor mints up to
the highest-snapshot-claimed-against. No special replay logic
needed in the messenger.

## Future messenger swaps (β2, β3)

The pluggable-messenger pattern means Governor can swap in a
faster proof system later via a single proposal:

- **β2 OP Succinct:** ZK validity proof of L2 state.
  - Latency: ~tens of minutes.
  - Trust delta: Succinct prover correctness (in addition to L1).
  - Implementation: `SuccinctMessenger` validates SP1 proofs.
- **β3 Hyperlane / LayerZero / Across:** third-party bridge
  attestation.
  - Latency: minutes.
  - Trust delta: bridge validator set.
  - Implementation: `HyperlaneMessenger` (or similar) reads
    bridge attestations.

The `IClaimMessenger` interface is sufficient for any of these.
Each implementation defines its own `bytes proof` format. Governor
proposal to swap: `JinnDistributor.setMessenger(newMessengerAddress)`
under standard 18-day flow.

The JinnDistributor's accumulators don't change across messenger
swaps. A snapshot proven via β1 (canonical) and a snapshot proven
via β2 (Succinct) for the same service are interchangeable —
they're both authoritative readings of the same on-chain state.

## Replay across messengers (corner case worth flagging)

If both β1 and β3 messengers are valid for the same period (e.g.,
Governor has authorized swapping but old β1 proofs are still
valid), the same logical work could be proven via two different
messengers. The accumulator math handles this fine:

- Proof via β1 first: claims up to snapshot S1.
- Proof via β3 second: same or higher snapshot S2 >= S1. If
  S2 > S1, mints the delta; if S2 = S1, no mint (no-op).

Different proof bytes, same recovered tuple. Idempotent.

## Open research items

### R-1 — Measure Base Sepolia L2→L1 finality

Concrete data needed: when a transaction is included in a Base
Sepolia block, how long until its corresponding output root is
committed to Sepolia AND the FaultDisputeGame resolves AND the
challenge period elapses?

Method:
1. Submit a no-op transaction on Base Sepolia.
2. Watch for the next output root submission on Sepolia
   OptimismPortal2.
3. Watch for the FaultDisputeGame creation + resolution.
4. Measure total time from L2 inclusion to L1 finality.

Repeat over a few periods to characterize variance. Document in
a new note: `cargo/docs/planning/2026-04-base-sepolia-finality.md`.

This research determines:
- Whether canonical OP-Stack messaging is practical for testnet
  burn-in (Phase D `r5z`).
- Whether MockMessenger's role in v0 is "CI / dev convenience
  only" or "active testnet messenger during burn-in."

### R-2 — Verify viem op-stack action coverage for Fault Proof

Confirm that viem's `viem/op-stack` exposes:
- `getProof` / `buildProveWithdrawal` for OptimismPortal2.
- DisputeGame resolution + readiness checks.
- Receipt + event log extraction in the proof format we need.

If gaps exist, fill them with hand-rolled proof construction in
the daemon (per `7x5` task scope).

### R-3 — Confirm Phase 0 / Phase 1a JinnRouter on Base Sepolia exposes evaluationDeliveryCount as public state

Earlier reads of `JinnRouterV2.sol` show `evaluationDeliveryCount`
is public state with auto-generated getter. Confirm against the
deployed implementation at
`0x3f1F4420E040C6667CDae0F7b77B71692f698938` via Blockscout to
ensure the storage layout hasn't changed.

## Test strategy

### Unit tests (Hardhat, in `cargo/contracts/test/jinn/cross-chain/`)

- **JinnClaimEmitter.test.ts** — emit event with correct values
  given mocked checker + router; revert on unknown serviceId.
- **MockMessenger.test.ts** — setFixture/verifyClaim round-trip;
  access control on setFixture; revert when no fixture set.
- **CanonicalOpStackMessenger.test.ts** — proof validation against
  fixture proofs (mock OptimismPortal2 + DisputeGameFactory);
  reject malformed proofs; reject not-yet-resolved games; reject
  proofs from wrong emitter address.
- **Distributor + Messenger integration.test.ts** — full mint flow
  with MockMessenger; weight changes apply correctly; replay
  protection works; messenger swap preserves accumulator state.

### Foundry invariants (Phase C, in
`cargo/contracts/test/jinn/invariants/`)

- `CanonicalOpStackMessenger.invariant.t.sol` — verifyClaim is
  deterministic + stateless; rejects malformed proofs by reverting;
  no storage writes during verifyClaim.
- `MockMessenger.invariant.t.sol` — only owner sets fixtures;
  verifyClaim returns set fixtures faithfully.

### Burn-in (Phase D, in `cargo/docs/runbooks/`)

- Real Base Sepolia → Sepolia end-to-end via canonical messenger,
  conditional on R-1 finality being practical.
- MockMessenger end-to-end if canonical isn't practical during
  burn-in window.
- At least one canonical-path test required before Phase D
  completes.

## Effects on the implementation plan

- **`6lq`** cross-chain contract impls: scope locked. Three
  contracts (`JinnClaimEmitter` ~30 lines, `CanonicalOpStackMessenger`
  ~120-150 lines, `MockMessenger` ~20 lines) plus the
  `IClaimMessenger` interface. Tests as listed above.
- **`olx`** JinnDistributor: ClaimTicket ABI with three counter
  values + multisig + serviceId. Per-channel weights as
  Governor-mutable storage. Math unchanged.
- **`pwg`** V2 + router hardening: includes the `verifiedCreations`
  counter + `creators` mapping needed for ε. Unchanged from the
  bd description; this spec just confirms the surface area.
- **`7x5`** daemon claim-loop + L1 proof construction: implements
  the canonical proof construction against OP-Stack tooling (viem)
  + the MockMessenger fallback path. Driven by `jinnMessengerMode`
  config flag.
- **`r5z`** testnet deploy + burn-in: includes R-1 finality
  measurement as a Phase D acceptance-criteria item.

## Decisions table

| # | Decision | Status |
|---|---|---|
| 1 | ClaimTicket event shape (3 counters + multisig + claimer + serviceId) | Locked |
| 2 | JinnClaimEmitter is stateless ~30 lines, permissionless | Locked |
| 3 | IClaimMessenger interface signature (returns 5-tuple, stateless) | Locked |
| 4 | CanonicalOpStackMessenger validates against OptimismPortal2 + Fault Proof | Locked |
| 5 | MockMessenger included in v0 (testnet/dev only); lifecycle pending R-1 | Locked |
| 6 | Daemon submits both txs by default; redeem permissionless | Locked |
| 7 | Replay protection lives in JinnDistributor accumulators only | Locked |
| 8 | Future β2/β3 messenger swaps via Governor proposal; same interface | Locked |
| R-1 | Measure Base Sepolia L2→L1 finality | Open research |
| R-2 | Verify viem op-stack coverage for Fault Proof | Open research |
| R-3 | Confirm V2 router public state on Base Sepolia | Open research |
