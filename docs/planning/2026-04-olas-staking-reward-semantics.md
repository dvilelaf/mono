# OLAS Staking Reward Semantics — Investigation Note

> Status: Findings + recommendation
> Date: 2026-04-27
> Branch: `jinn-mono/jinn-mono-1bo`
> Phase A0 of the Jinn v0 MVI implementation plan
> bd task: `jinn-mono-1bo`
> Reference: `docs/planning/2026-04-jinn-mvi-on-olas.md` (proposal) +
> `log/decisions/2026-04-27-jinn-mvi-on-olas-decisions.md` §10 (DR)

## The question

The v0 `JinnClaimEmitter` on Base reads accumulated OLAS reward for a
service from the deployed staking instance at
`0x51c5f4982b9b0b3c0482678f5847ea6228cc8e54` and emits a `ClaimTicket`
event. The downstream `JinnDistributor` on Ethereum then mints JINN
proportional to that snapshot, using monotonic per-service
accumulators (`totalClaimedOperator[serviceId]`,
`totalClaimedDao[serviceId]`) to prevent double-claim.

For this to be safe, **the snapshot read by the emitter must be
monotonic across calls** — i.e., it must represent
"cumulative-OLAS-earned-since-deploy," not "currently-claimable
balance." If the snapshot can decrease, the distributor's
subtraction (`entitled - alreadyClaimed`) underflows or under-mints.

## Finding

**`mapServiceInfo[serviceId].reward` is claimable-not-cumulative.**

It accumulates as checkpoints credit rewards, then **resets to zero**
when an OLAS-side claim extracts the funds.

Evidence in vendored `cargo/contracts/src/vendor/registries/staking/StakingBase.sol`:

- **Credit on checkpoint** (lines 991, 1005, 1015):
  `mapServiceInfo[curServiceId].reward += updatedReward;`
  Each checkpoint adds to per-service `reward` for eligible services.
- **Debit + zero on `_claim`** (lines 553–561):
  ```solidity
  reward = sInfo.reward;
  if (reward == 0) { revert ZeroValue(); }
  sInfo.reward = 0;  // ← field zeroed
  ```
- **Debit + zero on `_unstake`** (line 909): same pattern, but only
  when `enforced == false`.

There is **no separate cumulative-since-deploy counter** anywhere on
the contract. The cumulative trail exists only in event logs:

- `Checkpoint(uint256 indexed epoch, uint256 availableRewards, uint256[] serviceIds, uint256[] rewards, uint256 epochLength)` — credit side, line 1073.
- `RewardClaimed(uint256 epoch, uint256 indexed serviceId, address indexed owner, address indexed multisig, uint256[] nonces, address[] receivers, uint256[] rewardAmounts)` — debit side, lines 574, 914.

To compute "cumulative OLAS earned by service X" from on-chain state
alone, an observer must aggregate either every `Checkpoint` event's
contribution to X (sum of `rewards[i]` where `serviceIds[i] == X`) or
every `RewardClaimed` event for X plus the current `reward` field.
**Neither is queryable from a contract; both require off-chain
aggregation or storage-proof Merkleization.**

## Implications for `JinnClaimEmitter`

The proposal's nominal "stateless ~30 lines" emitter that just reads
`mapServiceInfo[serviceId].reward` is **unsafe** in any environment
where someone can call OLAS `_claim` between two `emitClaim` calls
*and* new rewards have accumulated in the interim. The naive flow:

```
T0: emitClaim          → reward=100, ticket(snapshot=100)
T1: someone calls _claim → reward=0
T2: checkpoint credits 50 → reward=50
T3: someone calls _claim → reward=0  ← lost 50!
T4: emitClaim          → reward=0, ticket(snapshot=0)
```

Without a stateful tracker on the emitter side or a hook into every
OLAS-claim call, work credited and extracted between `emitClaim`
calls is invisible to JINN.

## Design options

| Option | Shape | Safety | Complexity |
|---|---|---|---|
| **A.** Stateless emitter; reads `reward` directly | ~30 lines | Safe **only if no entity calls OLAS `_claim`** during the v0 window | Trivial |
| **B.** Stateful emitter with `lastObserved` + cumulative tracker | ~80 lines | Race-safe under monotonically-increasing `reward`; race-hazardous if OLAS `_claim` interleaves with no `emitClaim` between two checkpoints | Medium |
| **C.** Stateful emitter that *itself* calls `OLAS.claim` atomically (`claimAndEmit`) | ~80 lines | Race-free; emitter is the canonical capture of every claim | Requires the emitter to hold `serviceOwner` permission on every Jinn service (works in standard mode where stOLAS owns the service; awkward in Phase 0/1a where the operator is owner) |
| **D.** Off-chain `Checkpoint` event aggregation + Merkle proof on-chain | tens of lines emitter + significant messenger work | Most rigorous | High — requires storage-/event-proof verification in `CanonicalOpStackMessenger` |

## Recommendation for v0 testnet

**Adopt Option A (stateless ~30-line emitter) as the v0 testnet
default**, conditioned on a single operational invariant:

> No entity calls `OLAS.staking._claim(serviceId)` for any Jinn
> service while v0 is the active distribution mechanism.

Rationale:

1. The OLAS reward field accumulates monotonically as long as nobody
   extracts. With no extraction, the snapshot read from
   `mapServiceInfo[serviceId].reward` *is* cumulative-since-deploy by
   construction — exactly what the distributor needs.
2. In Phase 0/1a-mode (the v0 testnet operator UX), the operator is
   `serviceOwner` and is the only entity that can call `_claim`. The
   daemon controls operator behavior and can simply **not call
   `OLAS.staking._claim`** — the OLAS rewards remain held in the
   staking contract indefinitely from Jinn's perspective.
3. The §10 disposition decision (burn / DAO treasury / multisig /
   stOLAS yield) is open. If "burn" or any extraction is later
   locked, the extraction flow must be designed alongside an upgrade
   to Option B or C. v0 testnet does not pre-empt that design — it
   simply leaves OLAS in place.
4. JINN minting is unaffected: the distributor's accumulator
   subtraction is correct for any monotonic snapshot, whether or not
   the underlying OLAS has been extracted.

**Concrete v0 emitter sketch:**

```solidity
contract JinnClaimEmitter {
    IStakingBase public immutable staking;
    IServiceRegistry public immutable serviceRegistry;

    event ClaimTicket(
        uint256 indexed serviceId,
        uint256 snapshot,
        address indexed multisig,
        address indexed claimer
    );

    constructor(address _staking, address _serviceRegistry) {
        staking = IStakingBase(_staking);
        serviceRegistry = IServiceRegistry(_serviceRegistry);
    }

    function emitClaim(uint256 serviceId) external {
        uint256 snapshot = staking.mapServiceInfo(serviceId).reward;
        address multisig = serviceRegistry.mapServices(serviceId).multisig;
        emit ClaimTicket(serviceId, snapshot, multisig, msg.sender);
    }
}
```

No state. No owner. Permissionless. The invariant lives in the
operational story ("don't call OLAS `_claim`"), not in the contract.

## Hardening path for production / mainnet

When the §10 disposition decision lands and OLAS extraction is part
of the canonical flow (any of: burn, DAO treasury, etc.), the
emitter must be upgraded — most likely to **Option C
(`claimAndEmit`)** — so the cumulative tracker is on the emitter
side and the OLAS extraction is atomic with the snapshot.

Option C requires the emitter to be `serviceOwner` on every Jinn
service. In **standard mode** (stOLAS-backed operator UX, design
target per Locked Decisions §10) this is natural: the stOLAS
distributor stakes the service and can transfer ownership to (or
delegate to) the JinnClaimEmitter. In **Phase 0/1a mode** (v0
testnet), it's awkward because operators own their services
directly; an opt-in path would be needed.

A future spec session under bd `1bo` should design the production
emitter alongside the disposition decision. v0 testnet simply
ships Option A and documents the operational invariant.

## Other findings worth noting

- **`mapServiceInfo` is `public`** (line 329), so the getter
  signature `mapServiceInfo(uint256) returns (ServiceInfo)` is
  available. Reading from another contract is straightforward.
- **Service `multisig` is in `ServiceInfo`** as well (line 196 region;
  field used in `_claim` line 565), so the emitter could read
  multisig from the staking contract directly without touching the
  ServiceRegistry. Cleaner: read both `reward` and `multisig` from
  one `mapServiceInfo` call.
- **`epochCounter` is monotonically increasing**, included in the
  `RewardClaimed` event. Not directly useful for v0 but informative
  for any future event-aggregation path.
- **`tsCheckpoint`** records the timestamp of the last checkpoint
  — could be used for staleness checks if needed.

## Decisions made by this note

| # | Decision | Status |
|---|---|---|
| 1 | `mapServiceInfo[serviceId].reward` is claimable-not-cumulative — confirmed | Locked finding |
| 2 | v0 `JinnClaimEmitter` ships as Option A (stateless, ~30 lines) | Locked for v0 testnet |
| 3 | Operational invariant: daemon does not call `OLAS.staking._claim` for Jinn services in v0 | Locked for v0 testnet; documented in operator runbook |
| 4 | `JinnClaimEmitter` reads `multisig` from `mapServiceInfo` directly (one call) | Locked |
| 5 | Production emitter design (Option C `claimAndEmit` or equivalent) deferred to bd `1bo` follow-up | Open |

## Effect on the implementation plan

The Phase A4 estimate ("5–7 days, OptimismPortal2 / Fault Proof
integration") and contract-size estimate (~30 lines stateless OR
~60 lines stateful) **collapses to the stateless ~30-line shape for
v0 testnet**. The cross-chain spec (`l6b`) and the impls (`6lq`)
should reflect this.

The §10 implementation decision (burn-mechanism design) remains
deferred and re-engages when standard mode (stOLAS) testnet lands —
at which point the emitter likely gets upgraded to Option C.
