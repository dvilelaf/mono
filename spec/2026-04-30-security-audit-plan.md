# Security Audit Plan — Mainnet Gate

> Version: 0.1.0-draft
> Date: 2026-04-30
> Author: Oak, Claude (audit-lead seat)
> Status: **Proposal — ratification pending Captain + community sign-off**
> Related:
> - `docs/security/2026-04-jinn-v0-threat-model.md` — v0 threat model (testnet scope)
> - `docs/security/2026-04-jinn-v0-slither.md` — v0 Slither pass
> - `docs/security/2026-04-v2-checker-audit.md` — V2 checker hardening audit
> - `spec/2026-04-06-phase-1a-design.md` — Phase 1a design lock
> - bd `jinn-mono-cze` — Canonical messenger blacklist + retirement (mainnet-swap blocker)
> - bd `jinn-mono-g9j4` — Governance-flow exercise on testnet

## 1. Motivation

The v0 testnet threat model and Slither pass concluded with the explicit
disclaimer that **mainnet hardening, formal verification, and a third-party
auditor pass are out of scope for the v0 review and gated on later
milestones**. This document is that gate.

This plan ratifies *how* we audit the deployed contract stack before the
JINN token, governance, distributor, messenger, emitter, and V2
router/checker move from Sepolia / Base Sepolia to mainnet (Ethereum L1 +
Base L2). It does **not** commission the audit (separate spend decision)
and does **not** itself perform any review.

Three forces shape the plan:

1. **Mainnet asset value is real.** Inflated mints on testnet are
   recoverable by redeploy; on mainnet they are not. Per the v0 threat
   model, every severity goes up one notch on mainnet.
2. **The ecosystem already includes capable adversarial reviewers.**
   Community Solidity reviewers (Alex, Andre, others surfaced via the
   Phase A funnel) can deliver real findings at low marginal cost — *if*
   we engage them with structured deliverables and a clear comp model.
3. **AI-enabled audit tooling has matured fast.** Slither + Aderyn +
   Halmos already caught zero high/medium on v0; layering specialised
   AI auditors (Cyfrin Codex, Olympix) on top is now cheap and produces
   a coverage diff worth running before any external firm engages.

The plan composes these forces into five parallel workstreams with
explicit gating criteria for the mainnet deploy.

## 2. Scope

### 2.1 In-scope contracts (bespoke + modified)

Mainnet variants of the contracts deployed on testnet under Phase 1a /
Phase 1b. All paths relative to `cargo/contracts/src/`:

| Contract | Status | Audit depth |
|---|---|---|
| `jinn/token/JINN.sol` | bespoke (OZ ERC20Votes composition) | full |
| `jinn/distribution/JinnDistributor.sol` | bespoke (sole minter) | full + formal verification |
| `jinn/governance/JinnGovernor.sol` | bespoke (OZ Governor composition) | full |
| `jinn/cross-chain/CanonicalOpStackMessenger.sol` | bespoke (OP-Stack storage proof) | full + formal verification |
| `jinn/cross-chain/JinnClaimEmitter.sol` | bespoke (stateless emitter) | full |
| `jinn/interfaces/IClaimMessenger.sol` | interface | review only |
| `staking/RestorationActivityCheckerV2.sol` | modified OLAS fork | full |
| `staking/JinnRouterV2.sol` | modified OLAS fork | full |
| `staking/JinnRouterProxy.sol` | bespoke proxy | full |
| `staking/ActivityCheckerProxy.sol` | bespoke proxy | full |
| `claiming/ClaimRegistry.sol` | Phase 0 deployed (still active) | change-impact review |
| `claiming/AcceptAllChecker.sol` | Phase 0 deployed (still active) | change-impact review |
| `claiming/IEligibilityChecker.sol` | interface | review only |

Phase 1b adds (when those contracts land — separate dispatch):

- `vendor/governance/veOLAS.sol` → veJINN (modified OLAS fork) — full
- `vendor/governance/VoteWeighting.sol` → JINN gauge (modified) — full
- `vendor/tokenomics/Treasury.sol`, `Dispenser.sol`, `Tokenomics.sol` —
  configuration + governance review (see §2.2)

### 2.2 In-scope but reduced — vendored OLAS we deploy

These contracts are forks of upstream OLAS that we deploy with
configuration changes (not code changes), or with surgical no-op stubs
satisfying interface dependencies. They are upstream-audited; we audit
the *deploy* and the *governance configuration*, not the code.

| Contract | Source | Audit depth |
|---|---|---|
| `vendor/tokenomics/Treasury.sol` | OLAS upstream | deploy + config audit |
| `vendor/tokenomics/Dispenser.sol` | OLAS upstream | deploy + config audit |
| `vendor/tokenomics/Tokenomics.sol` | OLAS upstream | deploy + config audit |
| `vendor/bridge/DefaultDepositProcessorL1.sol` | OLAS upstream | deploy + config audit |
| `vendor/bridge/OptimismTargetDispenserL2.sol` | OLAS upstream | deploy + config audit |
| `vendor/registries/staking/StakingBase.sol` (and derivatives) | OLAS upstream | deploy + config audit |
| `vendor/stolas/*` | OLAS / stOLAS adaptation | deploy + config audit |
| OZ libraries (`Ownable2Step`, `TimelockController`, `Governor*`, `ERC20Votes`, `TrieProof`) | OpenZeppelin v5.6.1 | accept upstream audit; pin SHA |

Deploy + config audit covers:

- That the deployed bytecode matches the upstream-audited source at the
  pinned commit.
- That constructor parameters and post-deploy `setX` calls produce a
  configuration consistent with the threat model assumptions.
- That dormant features (Bonding / Depository / IDF / donator top-up
  inside Tokenomics) are either dead code paths in our config or wired
  to no-op stubs whose stub correctness is asserted in the bespoke
  audit.

### 2.3 Out of scope

- **Off-chain client (`client/`).** Operational risks documented in the
  threat model; cryptographic guarantees do not depend on it. Client
  hardening is a separate workstream.
- **OP-Stack canonical contracts (DisputeGameFactory, OptimismPortal2,
  L1Block, L2OutputOracle).** Third-party. The messenger trusts these.
- **OLAS MechMarketplace, ServiceRegistry, OLAS staking contract.**
  Third-party, deployed and operated by OLAS. Trusted.
- **Subgraph + alerting infrastructure.** Operationally critical but not
  on the cryptographic critical path.
- **Audit firm RFP / commercial selection.** Separate spend decision —
  see §8.

## 3. Audit workstreams

Five workstreams run in three temporal bands. Workstreams in the same
band run in parallel.

```
Band 1 (continuous, starts now):
  WS-1: AI-enabled static + symbolic analysis
  WS-2: Internal + community human review

Band 2 (post Band 1; commissioned via §8):
  WS-3: External audit firm
  WS-4: Formal verification on critical contracts

Band 3 (post Band 2):
  WS-5: Pre-mainnet bounty + canary
```

### 3.1 WS-1 — AI-enabled static and symbolic analysis

**Owner:** contracts (audit lead).

**Required toolchain:**

| Tool | Role | Prior use |
|---|---|---|
| Slither 0.11.x | static analysis (detector pack) | v0 pass complete |
| Aderyn (Cyfrin) | static analysis (Rust-based, complementary detectors) | new for mainnet |
| Halmos (a16z) | symbolic / formal-verification adjacent | new for mainnet |
| `forge inspect storageLayout` | storage-layout regression CI lint | pending — bd `jinn-mono-sz0` follow-up |
| `forge coverage` | line coverage of the test suite | exists; mandate ≥ 90% on bespoke contracts before audit |

**AI-augmented toolchain (layered on top of required):**

| Tool | Role | Notes |
|---|---|---|
| Cyfrin Codex | Solidity-specialised LLM auditor | run on every bespoke contract; coverage diff against Slither |
| Olympix Auditor | LLM auditor with detector library | run on every bespoke contract; coverage diff against Aderyn |
| GPT-5 / Claude Opus 4.7 with structured prompts | open-ended reviewer | document the prompt library used, attach to audit artifact |

**Deliverables:**

1. Mainnet-target SHA Slither pass — same shape as
   `docs/security/2026-04-jinn-v0-slither.md`, on the mainnet candidate
   commit. Baseline must be **zero high, zero medium**.
2. Aderyn report on the same SHA. Triage the same way as Slither.
3. Halmos symbolic-execution suite on `JinnDistributor.claim`,
   `JinnRouterV2.claimDelivery`, `RestorationActivityCheckerV2.recordRestorationEvidence`,
   `CanonicalOpStackMessenger.verifyClaim`. Document the symbolic
   properties and the path-completeness verdict.
4. AI-tool coverage diff: which findings did the AI tools surface that
   the static analysers missed (and vice versa)? File any
   non-overlapping findings as bd issues with severity tags.
5. `forge inspect` storage-layout snapshot for every proxied contract
   (`JinnRouterV2`, `ActivityCheckerProxy`, others as introduced).
   Snapshot is checked into `cargo/contracts/storage-layouts/` and a CI
   lint asserts no drift.

**Gate condition:** zero high, zero medium across all four required
tools at the mainnet-target SHA. Lows triaged and dispositioned
(accepted with rationale, or fixed).

### 3.2 WS-2 — Internal + community human review

**Owner:** audit lead; community coordinator (TBD).

**Reviewers (initial slate):**

- **Internal:** Oak (author of v0 stack), audit lead.
- **Community (committed):** Alex, Andre.
- **Community (invited):** open recruitment via the Phase A funnel.

**Engagement structure:**

Each community reviewer signs an engagement agreement covering scope,
deliverables, comp, confidentiality (the audit is on a public branch but
findings stay private until disclosure), and disclosure timing.

A reviewer is assigned a **review packet** consisting of:

- One bespoke contract (or a tightly-coupled pair like
  `JinnRouterV2` + `RestorationActivityCheckerV2`).
- Read-only access to the repo + the v0 threat model + the v0 Slither
  doc + the V2 checker audit.
- A standing 1:1 with the audit lead for clarification.
- A findings template (Markdown) with severity bands (Critical / High /
  Medium / Low / Informational), pre-condition + impact + reproducer
  + suggested fix per finding.

**Per-reviewer deliverable:** a findings doc per assigned contract,
landed as a PR to `docs/security/2026-MM-<reviewer>-<contract>.md`.

**Aggregation:** the audit lead consolidates findings across reviewers
into `docs/security/2026-MM-mainnet-audit-summary.md` with deduplicated,
severity-triaged findings. Reviewers see each other's work after their
own is submitted (post-cutoff), to avoid groupthink during the review
itself.

**Compensation model — RATIFICATION REQUIRED:** three options:

- (A) **Per-finding bounty.** Tiered by severity (e.g. 5/2/1/0.25 ETH for
  C/H/M/L), capped per contract. Aligns reviewers with offence.
- (B) **Flat consulting rate.** Day-rate × hours, capped per packet.
  Lower variance for the reviewer; lower offence-alignment.
- (C) **Hybrid.** Flat retainer covering minimum effort, plus per-finding
  bonus on top. Highest alignment, highest cost.

Recommendation: **(C) Hybrid**, sized so a clean-pass reviewer earns
their retainer and a finding-heavy reviewer earns a multiple. Captain
ratifies the actual numbers.

**Disclosure window:** community reviewers' findings are private for 14
days after submission, during which the audit lead and the contract
owner produce remediation PRs. After 14 days, findings disclose to the
project's public security log unless extended by mutual agreement.

**Gate condition:** every bespoke contract has at least one community
reviewer's findings doc landed; severity-Critical and severity-High
findings are either fixed or have an explicit accept-with-mitigation
disposition signed by the audit lead.

### 3.3 WS-3 — External audit firm

**Owner:** Captain (commercial sign-off); audit lead drives.

**Out of scope for THIS task — separate spend decision.**

The plan reserves the slot. The expected shape:

- One reputable Solidity audit firm (selection process is its own bd
  issue — see §8).
- Engagement covers all bespoke + modified contracts in §2.1.
- Deliverable: full audit report (findings + remediation suggestions),
  remediation pass on the team's fixes, final retest with sign-off
  letter.
- Schedule estimate: 6–10 weeks engagement + 2–4 weeks remediation +
  1–2 weeks retest = 9–16 weeks elapsed.

**Gate condition:** sign-off letter from the firm. All Critical / High
findings fixed (no exceptions). Mediums fixed or explicitly accepted in
the public audit response.

### 3.4 WS-4 — Formal verification on critical contracts

**Owner:** contracts.

**Targets:**

| Contract | Properties |
|---|---|
| `JinnDistributor` | per-service accumulator monotonicity; mint-equals-delta; `totalSupply ≤ Σ Claimed.{operator,dao}Minted`; CEI ordering on `claim()`; ratio bound checks |
| `CanonicalOpStackMessenger` | dispute-game finality preconditions; output-root preimage equality; account/storage MPT correctness against pinned `TrieProof`; snapshot-tuple binding correctness |
| `JINN` | `setMinter` is the only path to minter change; `mint` reverts unless `msg.sender == minter`; ERC20Votes `_transferVotingUnits` invariants (delegate to OZ proofs at the pinned version) |

**Tool — RATIFICATION REQUIRED:** Certora (commercial, polished) versus
internal Halmos work (open source, ~3× engineering effort, no licence
cost). Recommendation: **Certora for `JinnDistributor` and
`CanonicalOpStackMessenger`** because mint-integrity and proof-soundness
warrant the highest tool maturity; **Halmos for `JINN`** because the
properties are simpler and well-trodden via OZ's own proofs. Captain
ratifies vendor choice.

**Deliverable:** formal-verification reports per contract committed
into `docs/security/2026-MM-fv-<contract>.md`. Counter-examples (if
any) are filed as Critical bd issues with reproducer.

**Gate condition:** all stated properties prove or have an explicit
accept-with-rationale disposition signed by the audit lead AND the
external firm (cross-check).

### 3.5 WS-5 — Pre-mainnet bounty + canary

**Owner:** audit lead; operations.

**Pre-mainnet private bounty:** open to community reviewers (Alex,
Andre, anyone who signed an engagement agreement under §3.2) for
findings in the post-WS-1/WS-2/WS-3/WS-4 codebase. Window: 14 days
before the planned mainnet deploy date. Findings tier per §3.2.

**Public bounty:** Immunefi (or equivalent) listing live BEFORE the
mainnet deploy, but funded only after deploy. Tier matches the bounty
table in WS-2.

**Mainnet messenger canary:** before any mainnet `setMessenger` call to
the canonical messenger, the deployed messenger must successfully
verify N (recommended: 100) consecutive real Base Sepolia → Sepolia
proofs against the canonical OP-Stack pipeline, and N (recommended:
10) on Base mainnet → Ethereum mainnet via the verifier-only canary
path. This complements bd `jinn-mono-cze` (canonical messenger
blacklist + retirement + properness checks).

**Canonical-messenger blacklist:** the messenger MUST be deployed with
the blacklist + retirement + properness checks from bd `jinn-mono-cze`
landed and proven on testnet before any mainnet activation.

**Gate condition:** N canaries pass cleanly; bounty live; no Critical /
High findings open from the bounty within the 14-day window.

## 4. Coverage matrix

Who reviews what, by method. Each row is one bespoke / modified
contract; each column is a workstream. `R` = required; `O` = opt-in;
`-` = out of scope.

| Contract | WS-1 AI/Static | WS-2 Community | WS-3 Firm | WS-4 FV | WS-5 Bounty |
|---|:-:|:-:|:-:|:-:|:-:|
| `JINN` | R | R | R | R | R |
| `JinnDistributor` | R | R | R | R | R |
| `JinnGovernor` | R | R | R | O | R |
| `CanonicalOpStackMessenger` | R | R | R | R | R |
| `JinnClaimEmitter` | R | R | R | O | R |
| `RestorationActivityCheckerV2` | R | R | R | O | R |
| `JinnRouterV2` (+ proxy) | R | R | R | O | R |
| `ActivityCheckerProxy` | R | O | R | O | R |
| `ClaimRegistry` (Phase 0, change-impact) | R | O | O | - | R |
| `AcceptAllChecker` (Phase 0, change-impact) | R | O | O | - | R |
| Vendored OLAS (deploy + config only) | O | O | R | - | R |

## 5. Tooling shortlist (decided)

The static / symbolic / AI tooling mix for WS-1 is:

| Tool | Required | Scope |
|---|:-:|---|
| Slither 0.11.x | yes | every bespoke + modified contract |
| Aderyn (Cyfrin) | yes | every bespoke + modified contract |
| Halmos | yes | targeted symbolic suite on the four high-stakes functions in §3.1 |
| Cyfrin Codex | yes | every bespoke contract; coverage diff vs Slither |
| Olympix Auditor | yes | every bespoke contract; coverage diff vs Aderyn |
| `forge inspect` storage-layout | yes | every proxied contract; CI lint |
| `forge coverage` | yes | ≥ 90% line coverage on bespoke contracts before audit |
| Mythril | optional | as a third symbolic-analysis cross-check if Halmos coverage is incomplete |
| Echidna | optional | property-based fuzzing on `JinnDistributor` + `RestorationActivityCheckerV2` if Foundry invariants are insufficient |
| Certora | yes (formal verification, WS-4) | `JinnDistributor`, `CanonicalOpStackMessenger` |

Tools NOT selected:

- **Mythril as required.** Halmos covers the symbolic-execution slot at
  lower noise and faster cycle.
- **Trail of Bits' Crytic suite full pack.** Slither is included;
  manticore is superseded by Halmos for our properties.
- **Custom LLM auditor pipelines.** Cyfrin and Olympix are running
  productised pipelines; building our own is wasted engineering at this
  stage.

## 6. Engagement model — community reviewers

Detailed in §3.2; summarised here as a workflow:

```
1. Recruit: surface candidate reviewers via Phase A funnel + direct
   outreach to Alex, Andre, and 2–4 additional community Solidity
   reviewers. Track via bd (suggested issue: "Recruit mainnet audit
   community reviewers — Phase 0").

2. Onboard: each reviewer signs an engagement agreement (template to be
   drafted in a follow-up bd issue). Agreement covers:
     - Scope (which contracts)
     - Deliverable shape (findings template)
     - Compensation (per §3.2 ratification — A / B / C)
     - Disclosure window (14 days private)
     - Conflict of interest (no participation in bounty for the same
       contract during the engagement window; bounty re-opens to them
       post-disclosure)

3. Review: 4–6 week window. Per-contract review packet. Standing 1:1
   access to audit lead. Findings landed as Markdown PRs to a private
   `security-private/` branch, merged to public `docs/security/` post
   disclosure window.

4. Aggregate: audit lead consolidates findings into a single mainnet
   audit summary. Severity-triaged. Disposition documented per finding.

5. Pay: per the ratified comp model. Disbursement on summary publish.
```

**Conflict-of-interest note:** community reviewers in WS-2 are excluded
from the WS-5 bounty for contracts they reviewed, during the WS-5
window. They re-qualify for the bounty on contracts they did not
review, and on all contracts after the WS-5 window closes (i.e. on
mainnet).

**Public credit:** every community reviewer who lands a findings doc
is credited in the published audit summary and on the project's
security page. Anonymous credits permitted on reviewer request.

## 7. Gating criteria — mainnet pass conditions

### 7.1 Hard gates (must pass; no exceptions)

1. **WS-1 clean.** Slither, Aderyn, Cyfrin Codex, Olympix Auditor, and
   Halmos all return zero High and zero Medium findings on the
   mainnet-target SHA. Lows are triaged and dispositioned.
2. **WS-2 complete.** Every bespoke contract has at least one
   community reviewer's findings landed; all Critical and High findings
   are fixed.
3. **WS-3 sign-off.** External firm letter on file. Zero open Critical
   or High findings.
4. **WS-4 proofs.** Stated properties on `JinnDistributor` and
   `CanonicalOpStackMessenger` formally verified (or, at minimum,
   bounded-model-checked with no counter-examples up to the configured
   bound). Documented.
5. **Foundry invariant suite green.** The three invariant stubs
   (`JINN.invariant.t.sol`, `JinnDistributor.invariant.t.sol`,
   `CanonicalOpStackMessenger.invariant.t.sol`) are filled in and
   passing in CI on the mainnet-target SHA.
6. **Storage-layout CI lint live.** `forge inspect ... storageLayout`
   regression check runs in CI on every PR; the snapshot for the
   mainnet-target SHA is checked in.
7. **`DeployL1Stack.test.ts:234` green.** Pre-existing failure cleared
   (referenced as v0 §7.1).
8. **Off-chain alerting runbook in production.** Subgraph + alerting
   covers `MessengerUpdated`, `WeightsUpdated`, `RatiosUpdated`,
   `MinterUpdated`, `OwnershipTransferStarted`, `OwnershipTransferred`,
   abnormal `Claimed` magnitudes. Alerts route to a 24/7-staffed
   channel.
9. **Multisig handover runbook executed cleanly on testnet.** The Phase
   A6 → B handover (multisig → Timelock) executes end-to-end on testnet
   with all post-deploy verifier checks passing
   (`getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 0`, etc.). Refer to bd
   `jinn-mono-g9j4` (governance flows on testnet).
10. **Canonical-messenger canary passing.** N consecutive real OP-Stack
    proofs verified through `CanonicalOpStackMessenger` on Base Sepolia
    → Sepolia, and N proofs verified through the verifier-only canary
    on Base mainnet → Ethereum mainnet. Recommendation: N = 100 testnet,
    N = 10 mainnet canary.
11. **bd `jinn-mono-cze` closed.** Canonical messenger blacklist +
    retirement + properness checks landed and proven.

### 7.2 Soft gates (must be reasoned; can be waived with documented rationale)

1. AI-tool coverage diff has been reviewed; non-overlapping findings
   resolved or accepted with rationale.
2. Community reviewers have signed off on the published audit summary.
3. WS-5 private bounty closes with no Critical / High open beyond the
   14-day disclosure window.
4. Public bounty (Immunefi) listing is live (funded post-deploy).
5. Threat-model addendum for mainnet — `docs/security/2026-MM-mainnet-threat-model.md`
   — is published. This is a +1-severity rewrite of the v0 threat model
   reflecting mainnet asset value.

### 7.3 Out-of-band — not a gate but tracked

- Initial JINN distribution diversity. The v0 threat model flagged
  "concrete commitments on initial distribution diversity" as a mainnet
  prerequisite (§3.4). This is a tokenomics decision, not an audit
  decision. Tracked separately under the Phase A workstream; the audit
  plan only asserts that the diversity was delivered before mainnet
  deploy.
- Multisig `PROPOSER_ROLE` post-handover cooldown runbook (21 days from
  threat-model §7.4). Operational, tracked separately.

## 8. Timeline relative to Phase A and mainnet community-formation gate

### 8.1 Workstream timing

```
Week 0 (now):
  - This plan is ratified.
  - WS-1 begins (AI + static + symbolic): ~3-4 weeks elapsed.
  - WS-2 reviewer recruitment + onboarding begins: ~2 weeks elapsed.

Week 2:
  - WS-2 reviews begin (4-6 week window).

Week 4:
  - WS-1 deliverables complete; coverage diff filed.
  - External firm RFP closes; firm engaged (commences WS-3).

Week 8:
  - WS-2 deliverables complete; aggregation summary published
    (private; 14-day disclosure window applies).
  - WS-4 formal verification engagement begins (parallel with WS-3).

Week 14:
  - WS-3 firm report received; remediation begins.

Week 18:
  - WS-3 retest complete; sign-off letter received.
  - WS-4 formal verification reports received.

Week 20:
  - WS-5 pre-mainnet private bounty opens (14-day window).
  - Final invariant + storage-layout + alerting + handover gates
    verified (§7.1 items 5-11).

Week 22:
  - WS-5 closes; gating audit complete.
  - Mainnet deploy candidate; pending the mainnet community-formation
    gate (separate workstream).
```

This is the **hot-path** timeline. Slack of 2–4 weeks is realistic
across WS-3 and WS-4 due to firm calendars and remediation iteration.
Plan to mainnet on Week 24–28 from ratification.

### 8.2 Relationship to Phase A and mainnet community-formation

The audit gate runs in parallel with Phase A (testnet campaign launch
and operator recruitment) and the mainnet community-formation gate
(separate workstream — see DR-2026-04-30).

```
Phase A (in flight, testnet)          ──────────────────────────── ▶
                                        ▲
                                        │ provides operator + creator funnel
                                        │
Audit gate (this plan)                  ────────────[~22 weeks]────▶
                                                                    ▲
                                                                    │
Mainnet community-formation gate      ────────[separate]────────────▶
(initial distribution, handover                                     │
runbook ratification, etc.)                                         ▼
                                                                Mainnet deploy
```

Phase A drives the funnel that provides community reviewers (WS-2) and
bounty hunters (WS-5). The audit gate must complete before the mainnet
deploy. The community-formation gate can complete in parallel with the
audit gate and is **not** blocked by it; the audit gate is **not**
blocked by community-formation either, but neither gate alone is
sufficient for mainnet. Both gates plus the technical pre-flight
(deploy script verifier + simulated deploy on Sepolia) compose the
full mainnet readiness check.

## 9. Out of scope (explicit)

- **Performing the audits.** This plan ratifies how; execution is
  separate dispatches per workstream.
- **External audit firm selection / RFP / commercial negotiation.**
  Separate spend decision. File as bd issue once this plan is ratified.
- **Compensation amounts for community reviewers.** This plan
  recommends the comp *model* (hybrid retainer + per-finding bonus);
  the *amounts* are a Captain decision.
- **Specific Certora vs Halmos vendor allocation beyond §3.4
  recommendation.** Captain ratifies.
- **Audit budget envelope.** This plan does not propose a budget; that
  rolls up to the broader mainnet-readiness budget.
- **Bug bounty platform selection** (Immunefi vs Code4rena vs Sherlock
  vs self-hosted). File as bd issue when WS-5 is dispatched.
- **Post-mainnet audit cadence.** Continuous audit for upgrades is its
  own plan; not in scope here.

## 10. Open questions for ratification

These need a Captain answer (or a delegated answer with clear
ownership) before the plan is considered ratified.

1. **Comp model for community reviewers** — A (per-finding bounty) /
   B (flat consulting) / **C (hybrid)** recommended.
2. **Formal verification vendor allocation** —
   Certora (`JinnDistributor`, `CanonicalOpStackMessenger`) +
   Halmos (`JINN`) recommended.
3. **AI tooling vendor commitments** — Cyfrin Codex + Olympix Auditor
   recommended; need access agreements (some require enterprise
   contracts). Open question whether to layer in a third (e.g. a
   GPT-5-based bespoke pipeline) — recommend **no** at this stage.
4. **Phase 0 contracts (`ClaimRegistry`, `AcceptAllChecker`) scope** —
   change-impact only (recommended) or full re-audit. Recommended
   posture: change-impact, since they have been in production since
   Phase 0 with no incidents and the mainnet variant is bytecode-equal
   to the testnet-deployed variant.
5. **Disclosure window length for community reviewers** — 14 days
   (recommended) or shorter / longer.
6. **N for canonical-messenger canary** — 100 testnet + 10 mainnet
   canary recommended; can flex up to 1000 testnet + 100 mainnet
   canary if Captain wants stronger evidence.
7. **Mainnet threat-model addendum** — required (recommended) or
   optional. Recommended: required, as a soft gate (§7.2.5).

## 11. Acceptance for THIS task

This task ratifies the plan, not its execution. Acceptance is:

- This document lands at `spec/2026-04-30-security-audit-plan.md`.
- The §10 ratification questions are answered (or explicitly deferred
  with named owners).
- bd follow-up issues are filed for each workstream dispatch
  (WS-1 through WS-5) plus the firm-RFP, comp-amounts, and bounty-
  platform-selection sub-tasks. Filing is a separate dispatch — this
  task does not file them automatically; it surfaces the list:

**Suggested follow-up bd issues** (for the Captain to file or delegate
when ratifying):

- WS-1 dispatch: run AI + static + symbolic toolchain on mainnet-target SHA.
- WS-2 dispatch: recruit + engage community reviewers; produce findings.
- WS-3 RFP: external audit firm selection.
- WS-4 dispatch: formal verification on `JinnDistributor` and
  `CanonicalOpStackMessenger`.
- WS-5 dispatch: bounty platform selection + listing.
- Comp-amounts decision for community reviewers (depends on §10.1).
- Mainnet threat-model addendum draft (depends on §7.2.5).
- Storage-layout CI lint task (referenced as v0 §7.2 follow-up).
- `DeployL1Stack.test.ts:234` fix (v0 §7.1 follow-up).

Closing this task without filing those follow-ups means the audit
workstream does not start; the Captain may want to file them in the
same session.
