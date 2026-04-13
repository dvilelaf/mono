# Jinn Minimum Viable Implementation on OLAS — Launch Proposal

> Status: Proposal, not yet adopted
> Date: 2026-04-13
> Companion doc: `2026-04-next-phases.md` (full plan with phases)

## Proposal

**A reference implementation of the Jinn protocol on Base
mainnet,** shipped in four contract deploys — `JINN.sol`, a
~120-line `JinnDistributor.sol`, OpenZeppelin `TimelockController`,
and OpenZeppelin `Governor` — running on top of the existing
Phase 0 Jinn staking instance and unmodified OLAS infrastructure.

**Every JINN that ever exists is minted in response to
measurable operator work.** No pre-mine. No team allocation. No
sale. No airdrop. JINN is deployed with total supply zero; the
distributor is the sole minter; JINN comes into existence only
when an operator calls `claim(serviceId)` and the distributor
reads that service's accumulated OLAS reward from the Phase 0
staking contract. Each claim produces two mints simultaneously:
the majority share (75%) to the operator's service multisig,
and a fixed share (25%) to the DAO treasury. Both mints happen
in the same transaction, subject to the same rules, with no
shortcut. The DAO treasury grows organically with network
activity and is spendable only via Governor vote.

**There are no team keys.** Every admin action — changing the
minter, changing the ratio, upgrading to a new distributor — is
gated by an on-chain Governor vote. The Governor is controlled
one-token-one-vote by JINN holders, and the only way to get JINN
is to mine it. So governance is held by the people who
contribute to the network, in proportion to how much they
contribute.

**This is not a stepping stone toward the "real" Jinn protocol —
it is the protocol, in its simplest valid form.** Jinn is
defined as a system where JINN incentivizes the creation and
satisfaction of intents. The contracts in this proposal do
exactly that, in a way that is auditable, fair, and upgradeable
through a credibly decentralized path from day one.

## Why this shape

The hard parts of running a measurement substrate are already
done by OLAS and already deployed on Base mainnet: service
registration, bond escrow, activity tracking, anti-farming,
eviction, checkpoint accounting. We use them as-is. That is
what makes the launch contract surface so small.

Four benefits:

1. **It's a legitimate launch.** Every JINN comes from measured
   work. There is no allocation the team can point at and say
   "this is mine." The team's JINN has the same provenance as
   every other operator's: mined by running the daemon and doing
   intent work. The answer to "the team controls too much JINN"
   is "then go mine some; the rules are the same for everyone."

2. **It's decentralized from day one.** The team has no admin
   keys. There is no multisig in the critical path. The Governor
   contract controls the Timelock, the Timelock owns every
   mutable parameter, and the Governor is controlled by JINN
   holders. The team has no power that operators don't also
   have, proportionally to how much they've mined.

3. **It ships the actual protocol, fast.** ~3 days of contract
   work plus operator UX in parallel. The bottleneck becomes
   the *uncertain* part of Jinn — whether the daemon, intent
   layer, and operator experience are actually any good — not
   the tokenomics machinery.

4. **Nothing is locked in.** OLAS is a substrate choice, not an
   architectural commitment. If OLAS ever becomes a constraint
   we can stand up our own copies of any piece (still unmodified
   OLAS bytecode; still not a fork) and migrate. The distributor
   itself is replaceable via a Governor vote — any future
   distribution mechanism can ship as a v1+ distributor without
   unwinding v0.

## What gets shipped

### Four contract deploys

**1. `JINN.sol`** — new, ~80 lines. Inherits from OpenZeppelin
`ERC20`, `ERC20Permit`, and `ERC20Votes`. Reuses the inflation
logic from `contracts/src/vendor/governance/JINN.sol` (1B cap
for first 10 years, 2%/yr thereafter). Deployed with:
- `minter = JinnDistributor`
- `owner = TimelockController`
- Total supply at launch: **zero**

The switch from the solmate-based vendored JINN to an OZ-based
version is the cost of getting standard Governor compatibility
via `ERC20Votes` checkpoints. Token semantics are otherwise
identical to the vendored version. One fix on the way through:
`mint()` will **revert** past `inflationRemainder()` instead of
silently no-oping, so the distributor's `totalJinnClaimed`
accounting stays consistent with the token's real supply.

**2. `JinnDistributor.sol`** — new, ~100–140 lines. Core function:

```solidity
function claim(uint256 serviceId) external {
    uint256 olasEarned = stakingContract.mapServiceInfo(serviceId).reward;
    uint256 entitledOperator = (olasEarned * operatorRatio) / 1e18;
    uint256 entitledDao      = (olasEarned * daoRatio) / 1e18;
    uint256 owedOperator = entitledOperator - totalClaimedOperator[serviceId];
    uint256 owedDao      = entitledDao      - totalClaimedDao[serviceId];
    if (owedOperator == 0 && owedDao == 0) return;

    totalClaimedOperator[serviceId] = entitledOperator;
    totalClaimedDao[serviceId]      = entitledDao;

    address multisig = serviceRegistry.mapServices(serviceId).multisig;
    if (owedOperator > 0) jinn.mint(multisig,    owedOperator);
    if (owedDao      > 0) jinn.mint(daoTreasury, owedDao);
}
```

Note the `mint` (not `transfer`) — the distributor creates JINN
on demand. Each claim mints two parallel streams from the same
measurement: the operator's portion (at `operatorRatio`) to the
service multisig, and the DAO's portion (at `daoRatio`) to the
Timelock. Both streams accumulate independently per service, so
neither can double-claim.

**Deploy-time immutable parameters:** `jinn`, `stakingContract`,
`serviceRegistry`, `daoTreasury` (set to the Timelock address).
Changing any of these means deploying a new distributor.

**Mutable parameters (Governor-controlled only):** `operatorRatio`
and `daoRatio`. Either can be voted up, down, or to zero at any
time via Governor proposal. No owner, no multisig admin, no
`withdrawDust`, no `pause`.

**Initial ratio split at launch: 3:1 (operator : DAO).** For
every 4 units of JINN minted in response to measured work, 3
go to the operator and 1 goes to the DAO treasury. A meaningful
25% protocol share that builds a real treasury without
dominating operator incentives. Both ratios are Governor-
controllable, so the community can raise or lower the split
later.

**3. `TimelockController`** — OpenZeppelin, standard. Deployed
with `minDelay = 2 days`. Proposer and executor roles are held
by the Governor contract. The Timelock holds the `owner` slot
on `JINN.sol` and the admin role on `JinnDistributor`. Nothing
the Timelock does happens without a Governor proposal passing
first.

**4. `JinnGovernor`** — OpenZeppelin Governor, ~50 lines of
module composition. Inherits from `Governor`, `GovernorSettings`,
`GovernorCountingSimple`, `GovernorVotes`, `GovernorVotesQuorumFraction`,
`GovernorTimelockControl`. Deployed with:
- **Voting delay:** 2 days (172,800 s) — window between proposal
  creation and voting start, for public visibility
- **Voting period:** 14 days (1,209,600 s) — how long voting is
  open
- **Proposal threshold:** 0 JINN — anyone with any JINN can
  propose (controllable later via a Governor vote if spam
  becomes an issue)
- **Quorum:** 4% of `totalSupply` at the block of the proposal

These are the same defaults Doppler (and most OZ-Governor-based
protocols) use. They're changeable later via Governor proposal.

**Total bespoke Solidity: ~230 lines** (~80 JINN.sol + ~100
JinnDistributor + ~50 Governor module composition). The
TimelockController is unmodified OZ. The bespoke parts do one
thing each and have clear invariants.

### Already on Base mainnet, reused as-is

| Contract | Address | Role |
|---|---|---|
| Jinn staking instance | `0x51c5f4982b9b0b3c0482678f5847ea6228cc8e54` | Source of per-service OLAS reward measurement |
| Activity checker proxy | `0x477C41Cccc8bd08027e40CEF80c25918C595a24d` | Anti-farming gate |
| JinnRouter | `0xfFa7118A3D820cd4E820010837D65FAfF463181B` | Activity counter source |
| OLAS ServiceRegistry | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | Service registration + multisig lookup |
| OLAS ServiceRegistryTokenUtility | `0x34C895f302D0b5cf52ec0Edd3945321EB0f83dd5` | Token-agnostic bond accounting |
| OLAS ServiceManager | `0x1262136cac6a06A782DC94eb3a3dF0b4d09FF6A6` | Service create/activate/register flow |
| OLAS MechMarketplace | `0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020` | Request/delivery substrate |
| OLAS token | `0x54330d28ca3357F294334BDC454a032e7f353416` | Service bond token |

### Optional pre-launch hardening

- **Upgrade activity checker proxy from V1 to V2** for
  Hamming-distance anti-farming. In-place upgrade behind the
  existing proxy.
- **Upgrade JinnRouter to V2** if any V2 functionality is
  required.

Neither is required for the absolute minimum launch.

## Governance — no team keys, decentralized from day one

**The Governor contract is the only admin in the system.** Every
mutable parameter is gated by a Governor proposal, which goes
through the full flow: 2-day voting delay → 14-day voting period
→ 2-day timelock → execution. Total observation window for any
change is **18 days from proposal creation**. During that window
anyone can see the change coming and react: vote against it,
socially coordinate, stop running the daemon, claim outstanding
rewards, etc.

**Parameters and governance:**

| Parameter | Mutable? | Who decides | Delay |
|---|---|---|---|
| `jinn`, `stakingContract`, `serviceRegistry`, `daoTreasury` in the distributor | No | — | Immutable at deploy |
| Inflation cap on `JINN.sol` | No | — | Hardcoded |
| `minter` on `JINN.sol` (upgrade path to new distributor) | Yes | Governor proposal | 18 days total |
| `operatorRatio` in `JinnDistributor` | Yes | Governor proposal | 18 days total |
| `daoRatio` in `JinnDistributor` | Yes | Governor proposal | 18 days total |
| `owner` of `JINN.sol` / `JinnDistributor` | Yes | Governor proposal | 18 days total |
| Governor parameters (quorum, delay, period, threshold) | Yes | Governor proposal (self-governance) | 18 days total |
| Use of JINN accumulated in the DAO treasury | Yes | Governor proposal | 18 days total |
| Discretionary admin (`withdrawDust`, `pause`, etc.) | — | — | **Does not exist** |

**Voting power:** one JINN, one vote. Vote weight is tracked by
OZ's `ERC20Votes` checkpoint system — your voting power at any
given block is equal to your JINN balance at that block. No
locking required. Operators automatically gain governance weight
as they mine JINN, and automatically lose it if they sell or
transfer.

**Who governs at launch?** At deploy, total JINN supply is zero
and nobody has voting power. The Governor exists but can do
nothing until the first operator mines some JINN and the
proposal threshold (0) is passable. Early in the network,
governance is dominated by whoever has mined the most — which
is the honest reflection of who's contributed the most. As the
operator set grows, governance naturally decentralizes.

**Worst-case behavior under key compromise:** there are no keys
to compromise. The team has no admin power that operators don't
also have, proportionally to their mined JINN. A hostile actor
would need to acquire enough JINN (by mining it, or buying it
from operators who chose to sell) to pass a proposal and hold it
for the full 18-day observation window. That is the same
threshold any other attacker would face. There is no shortcut
through an admin multisig.

**Team mining policy (open question).** The team *can* run
operators and mine JINN just like anyone else. Options:
- **Team mines normally** — no special treatment, team's
  governance weight matches team's work contribution.
- **Team abstains for N months** — explicitly doesn't mine
  during a bootstrap period, so early governance is owned by
  external operators.
- **Team mines but publishes wallet addresses** — transparent so
  the community can see exactly how much governance weight the
  team holds.

This is a social commitment, not a contract constraint. See
Open Decisions.

**The DAO treasury.** Every claim mints JINN to two destinations
at the same time: the operator's service multisig (at
`operatorRatio`) and the Timelock (at `daoRatio`). At launch
the split is **3:1** — for every 4 units of JINN minted, 3 go
to the operator and 1 goes to the DAO treasury. The treasury
JINN is held in the Timelock, which is controlled by the
Governor. Governor votes decide what to do with it. Plausible
uses:

- **Pairing JINN with ETH or USDC to seed a Uniswap pool.** The
  single cleanest answer to the "no launch liquidity" tradeoff
  — the DAO accumulates enough JINN over time to bootstrap its
  own liquidity without anyone having to sell mined rewards.
- **Contributor grants, audits, infrastructure, bug bounties.**
  Operational funding that doesn't require a team treasury.
- **Retroactive rewards for Phase 0 operators** or other early
  contributors, if the community votes to distribute part of
  the treasury that way.
- **Ongoing protocol development.** Paying for v1+ distributors,
  client improvements, security reviews.

This preserves the mining principle — no shortcut, no pre-mine,
no allocation — while giving the DAO a credible path to
organic funding. The DAO's JINN has the same provenance as
every operator's: minted in response to measured work, at a
ratio set by Governor vote.

**Framing check:** the DAO's share is not a tax on operator
earnings. Operators receive exactly `operatorRatio` JINN per
unit of OLAS measured — that number is what operators earn. The
DAO's share is a separate, parallel mint at its own `daoRatio`,
minted in the same transaction but tracked independently. If
the community ever decides they don't want DAO accumulation,
they can vote `daoRatio` to zero and the DAO stream stops —
without affecting what operators earn.

## How operators experience it

Operators already running Phase 0 today do exactly what they do
today: register a service, bond OLAS, run the daemon, earn OLAS
rewards. The only new behavior on day 1 of v0 is that they can
call `JinnDistributor.claim(serviceId)` and JINN flows to their
service multisig proportional to their accumulated OLAS rewards.
The daemon's `reward-claim-loop.ts` adds a second claim target.
Everything else is unchanged.

**Future mode not in v0: standard mode (stOLAS-backed, JINN-only
operator UX).** Already implemented in
`client/src/earning/bootstrap.ts` (commits `ad067cdf` onward),
waiting on stOLAS mainnet deployment. Operators would run
without bonding OLAS themselves.

**Governance participation.** Any operator holding JINN
automatically has voting power. No lockup required. If they
want to propose a change, they propose; if they want to vote,
they vote. The daemon can eventually add a `jinn vote` command
that reads pending proposals and helps operators participate.

## Tradeoffs

**What the mining-only + Governor model gives up:**

- **No team treasury in JINN.** The team has zero JINN at
  launch and no special path to get any. The team's only path
  to JINN is mining it via operators like anyone else, or
  proposing via Governor to draw from the DAO treasury — which
  requires winning a vote by JINN holders. Operational expenses
  (contributors, audits, infrastructure) can be funded from
  the DAO treasury via Governor vote, but only once the
  treasury has accumulated meaningful balance.
- **No immediate launch liquidity.** JINN exists but isn't
  immediately tradeable. Liquidity emerges when either an
  operator pairs their mined JINN against ETH/USDC, or the
  Governor votes to pair some of the DAO treasury's JINN
  against ETH/USDC. For the first period after launch, JINN
  has no market price — its value is implicit in "what
  operators believe it's worth." The DAO treasury accumulates
  during this period and can bootstrap its own liquidity once
  it has enough balance.
- **Early governance is concentrated.** In the first weeks,
  very few operators have mined JINN, so a small number of
  addresses effectively control the Governor. This is honest
  — governance weight reflects real contribution — but it
  means early decisions happen under a small voter base.
  Decentralizes naturally as mining grows.
- **Counterparty exposure to OLAS.** We reuse OLAS's
  registries, manager, marketplace, and staking instance. If
  OLAS ever pauses or removes access, Jinn is affected.
  Mitigation: deploy our own copies later if needed (still
  unmodified bytecode; the daemon already supports arbitrary
  addresses via config).

**What we don't give up:**

- **Legitimacy.** No pre-mine, no allocation, no sale. Every
  JINN has the same provenance: measured operator work.
- **Decentralization from day one.** No team keys. No multisig
  in the critical path. All admin actions require Governor
  proposals held by JINN holders.
- **Anti-farming / anti-replay / anti-grief.** All inherited
  from the staking contract or guaranteed by the distributor's
  minting accounting.
- **Audit-ability.** ~230 lines of bespoke code across three
  small contracts, plus standard OZ Governor + TimelockController
  (audited upstream). Bounded scope.
- **Forward compatibility.** Every v1+ governance shape ships
  as a new distributor contract, proposed and activated via
  Governor vote. No v0 commitment forecloses any v1+ evolution.
- **Optionality on the substrate.** OLAS is a v0 convenience,
  not a permanent architectural commitment.

## What comes after v0

Each thing that's *not* in v0 has a clean v1+ path that ships
as a Governor proposal — deploy a new contract, propose its
activation, JINN-holding operators vote, if approved it goes
through the 18-day flow and activates.

- **Operator-weighted voting with time decay / ve-JINN.** A
  v1 distributor that uses a ve-JINN lock contract for vote
  weighting instead of raw balance. Proposed via Governor.
- **Multi-channel emission.** A v1 distributor that reads
  per-channel activity counters from JinnRouter (creation,
  delivery, evaluation) and emits at different rates per
  channel. Proposed via Governor.
- **Jinn-native staking, marketplace, registries.** Deploy
  fresh copies of the vendored OLAS bytecode under
  Jinn-controlled ownership. Operators migrate by re-registering.
- **Liquidity bootstrapping via Doppler or similar.** If the
  network eventually decides JINN should be tradeable with
  bootstrapped liquidity, the Governor can authorize minting
  a tranche into a Doppler launch, or pairing an existing
  holder's JINN into a Uniswap pool. Not in v0.

The principle: **prove the system first, accumulate
architectural commitments only as we learn what we actually
need.** v0 commits to mining-only distribution and OZ Governor
over a JINN-holding voter base. Everything else is a future
Governor proposal.

## Open decisions required before shipping

1. **The initial ratio split.** Current draft is **3:1**
   (75% operator / 25% DAO treasury). Both `operatorRatio` and
   `daoRatio` are set at deploy and changeable only via Governor
   proposal. The absolute value of `operatorRatio` (i.e. how
   much JINN per unit of OLAS earned) is the main economic
   knob; the ratio split determines the DAO's share. Open for
   adjustment before deploy — want it more aggressive (2:1,
   50% DAO)? Less aggressive (9:1, 10% DAO)?

2. **Inflation model — capped, uncapped, or time-based
   schedule?** In the mining model, supply growth is a function
   of work rather than time, which raises a real design choice
   about how to bound it. Three options:

   - **Option A (keep the vendored cap).** `JINN.sol` inherits
     the vendored 1B cap for the first 10 years, then 2%/yr
     thereafter. We calibrate `operatorRatio + daoRatio`
     against expected OLAS reward volume so the network
     doesn't hit the cap early. **Risk:** if the ratio is too
     high, late-joining operators get frozen out when the cap
     is hit; if too low, we leave headroom unused. Requires an
     upfront estimate of 10-year OLAS reward volume from the
     Phase 0 staking contract.
   - **Option B (uncapped, work-driven forever).** Remove the
     cap entirely. Supply is always exactly `total_work × ratio`
     with no upper bound. Simpler, no calibration needed, no
     freeze-out risk. **Trade:** no predictable ceiling for
     token holders; dilution is unbounded if network grows
     10x or 100x. Changes the narrative to "programmable money
     that gets created in response to specific measurable work,
     forever."
   - **Option C (time-based schedule in the distributor).**
     Enforce a max-supply curve at the distributor level (e.g.
     linear 100M/yr, exponential, or Bitcoin-style halvings).
     Claims are capped at remaining headroom and pending
     unpaid portions carry over. **Trade:** more contract
     complexity, breaks the "every claim mints exactly
     `work × ratio`" invariant, but fully predictable supply
     schedule independent of network activity.

   **This is load-bearing for how the token's dilution story
   works.** It affects how `operatorRatio` should be calibrated,
   and it affects the `JINN.sol` rewrite (Option A keeps the
   vendored inflation logic; Option B strips it out; Option C
   leaves `JINN.sol` as in A but adds logic to the
   distributor). Needs a real call before the deploy.
3. **Governor parameters.** The recommendation is to use
   Doppler-style defaults (2-day voting delay, 14-day voting
   period, 0 proposal threshold, 4% quorum fraction, 2-day
   timelock). Any of these can be tuned before deploy and by
   subsequent Governor votes. Does the default feel right, or
   do we want something different for v0?
4. **Team mining policy.** Mine normally, abstain for N months,
   or mine transparently with published addresses? This is a
   social commitment, not a contract constraint.
5. **Initial liquidity plan.** When (and whether) JINN becomes
   tradeable. The DAO treasury provides a natural answer:
   once it has accumulated enough, a Governor vote can pair
   JINN with ETH or USDC to bootstrap a Uniswap pool. This
   defers the liquidity decision to the point where the
   treasury has enough balance to fund it, and puts the
   decision in the hands of JINN holders. No action needed
   for the launch itself.
6. **Optional checker upgrade.** Ship V1 anti-farming (already
   on `0x477C…`) or upgrade to V2 before opening to outside
   operators?
7. **Coexistence framing with OLAS.** This launch reuses OLAS's
   deployed contracts. Worth telling OLAS, not asking permission.
   How do we frame the relationship?
8. **JINN.sol rewrite details.** The OZ `ERC20Votes` rewrite
   replaces the vendored solmate token. Mostly mechanical. The
   `mint()` behavior change (revert instead of silent no-op
   past the inflation cap) is a deliberate fix *if* we keep
   the cap — i.e. Option A or C in the inflation model
   decision above. If we go Option B (uncapped), the inflation
   logic is removed entirely and `mint()` reverts only on
   access control, not supply. The choice of inflation model
   determines this.

## Timeline

- **Phase A — Mainnet deploys: ~3 days.** Write `JINN.sol`
  (OZ-based) and `JinnDistributor.sol`. Deploy JINN, Distributor,
  TimelockController, Governor. Wire ownership topology: Governor
  owns Timelock, Timelock owns JINN + Distributor admin, JINN's
  minter is Distributor. One team operator demonstrates the
  claim flow.
- **Phase B — Operator UX + intent layer: 2–6 weeks.** README
  at repo root, mainnet operator guide, `jinn status`, fix
  e2e blockers, recruit one external operator.
- **Phase C — Security: 1–2 weeks (parallel with A).** Coverage,
  Foundry invariants on JinnDistributor + JINN.sol, Slither,
  threat model, audit scope.

**Realistic outside window: ~6 weeks** from "decisions made" to
"external operator earning JINN on Base mainnet."

## Appendix: Verified facts about OLAS on Base mainnet

Verified by reading deployed bytecode on Base mainnet (chain
8453) via Blockscout source inspection and `read_contract`
calls.

1. **`StakingFactory.createStakingInstance` is permissionless**
   (vendored source line 185).
2. **`StakingFactory` permits `verifier = address(0)`**
   (constructor line 103–106). Bypassing the verifier is a
   config change, not a fork.
3. **`StakingVerifier` hardcodes OLAS as the only allowed
   reward token** (line 288). Irrelevant when verifier is
   zero or skipped.
4. **`ServiceRegistryTokenUtility.createWithToken` accepts any
   ERC-20.** Verified at `0x34C8…3dd5`.
5. **`ServiceManager.create()` accepts arbitrary ERC-20 or
   ETH.** Verified at impl `0x1eAc…Cbc29` behind proxy
   `0x1262…F6A6`. `paused == false`.
6. **`StakingBase._checkRatioPass` delegates all activity math
   to the checker** (line 456). No unit mismatch possible.
7. **`RestorationActivityCheckerV2.isRatioPass` is internally
   self-consistent** (1e18 scale on both sides, line 240–252).
8. **`MechMarketplace.create()` is whitelist-gated, but Phase 0
   already passed the gate** — Phase 0 has been delivering
   through this marketplace for months.
9. **Doppler's standard `GovernanceFactory` deploys an OpenZeppelin
   `Governor` + `TimelockController`** with defaults
   2d voting delay, 14d voting period, 0 proposal threshold,
   4% quorum fraction. The same stack can be deployed directly
   without Doppler's launch mechanism.

---

**One-line summary:** **The minimum viable implementation of the
Jinn protocol, launched in a legitimate and decentralized way** —
four contract deploys on Base mainnet (`JINN.sol` ERC20Votes +
~140-line `JinnDistributor.sol` + OZ `TimelockController` + OZ
`Governor`) running on top of the existing Phase 0 Jinn staking
instance and unmodified OLAS registries. Every JINN is minted
in response to measurable operator work, split 75% to the
operator and 25% to a Governor-controlled DAO treasury that
accumulates organically and can bootstrap its own liquidity.
The team has zero pre-allocation and no admin keys — all
governance is held by JINN holders via standard OZ Governor
voting with an 18-day observation window on every change.
