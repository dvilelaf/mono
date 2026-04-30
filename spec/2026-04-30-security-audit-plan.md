# Jinn Security Plan — Mainnet Gate and Standing Posture

> Version: 0.1.0-strawman
> Date: 2026-04-30
> Author: Oak, Claude (audit-lead seat)
> Status: **Strawman — community review open**
> Companion artifact: a GitHub Discussion linking to this spec (draft in
> Appendix A) for community review by Alex, Andre, and others.
> Related:
> - `docs/security/2026-04-jinn-v0-threat-model.md` — v0 threat model (testnet scope)
> - `docs/security/2026-04-jinn-v0-slither.md` — v0 Slither pass
> - `docs/security/2026-04-v2-checker-audit.md` — V2 checker hardening audit
> - `spec/2026-04-06-phase-1a-design.md` — Phase 1a design lock
> - bd `jinn-mono-cze` — Canonical messenger blacklist + retirement
> - bd `jinn-mono-g9j4` — Governance-flow exercise on testnet

## 1. Motivation

Mainnet readiness for Jinn is broader than a smart-contract audit. The
v0 testnet review, Slither pass, and V2 checker audit explicitly defer
mainnet-grade assurance to a later milestone. This plan is that gate —
*and* it sits inside a wider security posture for a protocol that is
being developed in the open.

Four forces shape the plan:

1. **Mainnet asset value is real.** Inflated mints on testnet are
   recoverable by redeploy; on mainnet they are not.
2. **Open development changes the threat model of the *project*, not
   just the protocol.** A public repo means public CI, public
   dependency graph, public discussion threads, public threat model,
   public incident response. Hygiene at this layer is part of "is Jinn
   safe to use," not adjacent to it.
3. **AI-augmented security tooling is a fast-moving frontier.** Beyond
   smart-contract scanners, AI-native general SAST, autofix bots, and
   agentic review tooling have matured fast in 2026. We need a
   deliberate research pass to pick a stack rather than defaulting to
   familiar names.
4. **Lean by design.** No external commercial audit firm is in the
   plan. Modern AI tooling + community human review + formal verification
   on critical paths + a public bounty cover the audit surface without a
   firm engagement, at a fraction of the cost. This is a deliberate
   posture for a protocol developed in the open by a small team — not a
   corner cut. We expect the same scrutiny as a firm-audited project,
   delivered by a different combination of mechanisms.

The plan organises the response into **three top-level sections**, each
with **two layers**: pre-mainnet **gates** (bright-line, can ratify
pass/fail) and **standing commitments** (ongoing cadences with named
owners that survive mainnet deploy).

```
┌─────────────────────────────────────────────────────────────┐
│                    Section 1                                │
│              Protocol security                              │
│       (smart contracts going to mainnet)                    │
│   ─────────────────────────────────────────                 │
│   Gates: audit + FV + invariants + canary + ...             │
│   Commitments: continuous audit, upgrade review             │
├─────────────────────────────────────────────────────────────┤
│                    Section 2                                │
│            Operational security                             │
│      (the codebase + the project's operations)              │
│   ─────────────────────────────────────────                 │
│   Gates: secret-clean, signed releases, IR runbook, ...     │
│   Commitments: dep review cadence, scorecard target, ...    │
├─────────────────────────────────────────────────────────────┤
│                    Section 3                                │
│          Methodology + tooling research                     │
│   (how we do 1 and 2, and what we use to do it)             │
│   ─────────────────────────────────────────                 │
│   Strawman shortlist + evaluation criteria + integration    │
│   plan. This section feeds Sections 1 and 2.                │
└─────────────────────────────────────────────────────────────┘
```

This document does **not** commission audits, fix budget numbers, or
file follow-up bd issues. Those are explicit follow-up dispatches once
the strawman is ratified.

## 2. Scope

### 2.1 In scope

- **Section 1 (protocol security):** mainnet variants of all bespoke +
  modified contracts in `cargo/contracts/src/jinn/**`,
  `cargo/contracts/src/staking/**`, and `cargo/contracts/src/claiming/**`,
  plus the OLAS forks we deploy with code changes. Vendored OLAS
  contracts deployed unchanged are reviewed at the deploy-and-config
  level only.
- **Section 2 (operational security):** the public repository
  (`jinn-network/jinn-mono` and its current development branches), the
  CI/CD pipeline, dependency graph (TypeScript + Solidity sides), the
  release artifacts (when releases begin), the incident-response
  posture, and the open-development surface (discussions, issues, PRs,
  threat model maintenance).
- **Section 3 (methodology + tooling research):** the candidate stack
  of OSS and AI-native security tooling that supports Sections 1 and 2,
  including evaluation criteria, integration plan, and licensing /
  cost / OSS-compatibility analysis.

### 2.2 Out of scope

- **Operator-side daemon hardening.** Agent operators running Jinn
  daemons hold keys, environment secrets, and signing material. That is
  a separate plan ("running Jinn securely") with a different audience.
  This plan touches operator security only where the *protocol*
  enforces or undermines it.
- **OP-Stack canonical contracts** (DisputeGameFactory, OptimismPortal2,
  L1Block, L2OutputOracle) — third-party.
- **OLAS MechMarketplace, ServiceRegistry, OLAS staking contract** —
  third-party.
- **Subgraph + alerting infrastructure code paths.** Operationally
  critical but on a separate audit track.
- **External audit firm RFP / commercial selection.** Separate spend
  decision; this plan reserves the slot.
- **Compliance / legal posture (SOC2, etc.).** Premature for testnet
  protocol. Future work once revenue and user data warrant it.

---

## 3. Section 1 — Protocol security

This section subsumes the existing v0 threat model + Slither + V2
audit work, layered with the additional mainnet-gate work documented
below. Refer to those documents for current state; this section
specifies *what changes* for mainnet.

### 3.1 In-scope contract surface

Bespoke + modified contracts (full audit):

| Contract | Path | Status |
|---|---|---|
| `JINN` | `jinn/token/JINN.sol` | bespoke (OZ ERC20Votes composition) |
| `JinnDistributor` | `jinn/distribution/JinnDistributor.sol` | bespoke (sole minter) |
| `JinnGovernor` | `jinn/governance/JinnGovernor.sol` | bespoke (OZ Governor composition) |
| `CanonicalOpStackMessenger` | `jinn/cross-chain/CanonicalOpStackMessenger.sol` | bespoke (OP-Stack storage proof) |
| `JinnClaimEmitter` | `jinn/cross-chain/JinnClaimEmitter.sol` | bespoke (stateless emitter) |
| `RestorationActivityCheckerV2` | `staking/RestorationActivityCheckerV2.sol` | modified OLAS fork |
| `JinnRouterV2` (+ proxy) | `staking/JinnRouterV2.sol`, `JinnRouterProxy.sol` | modified OLAS fork |
| `ActivityCheckerProxy` | `staking/ActivityCheckerProxy.sol` | bespoke proxy |
| `ClaimRegistry`, `AcceptAllChecker` | `claiming/*.sol` | Phase 0 deployed; change-impact only |

Phase 1b additions land in scope when those contracts ship: veJINN,
JINN gauge (VoteWeighting fork), Treasury / Dispenser / Tokenomics
configuration, bridge adapters.

### 3.2 Audit workstreams

Four parallel workstreams, layered defence-in-depth. **No external
commercial audit firm** — see §1 force #4 for the rationale.

**WS-1 — AI-enabled static + symbolic analysis.**
Required toolchain: Slither, Aderyn, Halmos, Foundry invariants,
`forge inspect storageLayout`, `forge coverage`. AI-augmented layer:
Aderyn-MCP, Olympix, and at least one general-purpose LLM auditor (see
§5 for the strawman). Deliverable: per-tool findings docs +
coverage-diff reasoning. **Gate:** zero High, zero Medium across
required tools at the mainnet-target SHA; lows triaged.

**WS-2 — Internal + community human review.**
Reviewers: internal (Oak, audit lead) + committed community (Alex,
Andre) + invited via the Phase A funnel. Per-reviewer review packet
covering one bespoke contract (or a tightly-coupled pair). Findings
land as Markdown PRs to a private branch, public after a 14-day
disclosure window. Audit lead aggregates into one mainnet-audit summary.
Compensation model is open question §8.1. **Gate:** every bespoke
contract has at least **two** independent community reviewers (the
two-reviewer minimum compensates for the absence of a firm pass);
every Critical and High finding is fixed.

**WS-3 — Formal verification on critical contracts.**
Targets: `JinnDistributor` (mint-equals-delta, accumulator monotonicity,
`totalSupply` upper bound, CEI ordering), `CanonicalOpStackMessenger`
(dispute-game finality preconditions, output-root preimage equality,
account/storage MPT correctness, snapshot-tuple binding), `JINN`
(minter-only mint, ERC20Votes invariants). Tool allocation is open
question §8.2 (Halmos OSS vs hevm vs Certora's free-for-OSS tier).
**Gate:** all stated properties prove or have an explicit
accept-with-rationale disposition.

**WS-4 — Pre-mainnet bounty + canary.**
Pre-mainnet private bounty for community reviewers: 14-day window
before deploy. Public bounty (Immunefi or equivalent) listing live
*before* mainnet, funded after. Mainnet messenger canary: N consecutive
real OP-Stack proofs verified through `CanonicalOpStackMessenger` on
testnet (recommend N=100) and on mainnet via verifier-only canary
(recommend N=10). Combined with bd `jinn-mono-cze` (canonical messenger
blacklist + retirement + properness checks). **Gate:** N canaries pass
clean; bounty live; no open Critical / High from the bounty window.

### 3.3 Coverage matrix

Per-contract × workstream coverage. `R` = required; `O` = opt-in;
`-` = out of scope.

| Contract | WS-1 | WS-2 | WS-3 | WS-4 |
|---|:-:|:-:|:-:|:-:|
| `JINN` | R | R | R | R |
| `JinnDistributor` | R | R | R | R |
| `JinnGovernor` | R | R | O | R |
| `CanonicalOpStackMessenger` | R | R | R | R |
| `JinnClaimEmitter` | R | R | O | R |
| `RestorationActivityCheckerV2` | R | R | O | R |
| `JinnRouterV2` (+ proxy) | R | R | O | R |
| `ActivityCheckerProxy` | R | O | O | R |
| `ClaimRegistry`, `AcceptAllChecker` | R | O | - | R |
| Vendored OLAS (deploy + config only) | O | O | - | R |

### 3.4 Gates (block mainnet)

1. **WS-1 clean** — required toolchain returns zero High and zero Medium
   on the mainnet-target SHA. Lows triaged.
2. **WS-2 complete** — every bespoke contract has at least **two**
   independent community findings docs landed; all Critical + High fixed.
3. **WS-3 proofs** — stated properties on `JinnDistributor` and
   `CanonicalOpStackMessenger` formally verified or bounded-checked
   without counter-examples.
4. **Foundry invariant suite green** — the three invariant stubs filled
   in and passing (referenced in the v0 Slither summary).
5. **Storage-layout CI lint live** — `forge inspect ... storageLayout`
   regression check on every PR; mainnet-target snapshot committed.
6. **Multisig handover runbook executed cleanly on testnet** — Phase A6
   → B handover end-to-end, all post-deploy verifier checks pass
   (`getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 0`, etc.).
7. **Canonical-messenger canary passing** — N testnet + N mainnet
   verifier-only canaries clean.
8. **bd `jinn-mono-cze` closed** — canonical messenger blacklist +
   retirement + properness checks landed and proven.
9. **Mainnet threat-model addendum published** — a +1-severity rewrite
   of the v0 threat model reflecting mainnet asset value, landed at
   `docs/security/2026-MM-mainnet-threat-model.md`.

### 3.5 Standing commitments (post-mainnet)

| Commitment | Cadence | Owner |
|---|---|---|
| Re-run WS-1 toolchain on every protocol-touching PR | per-PR (CI) | contracts |
| Targeted human review (WS-2 shape) for every protocol upgrade | per upgrade | audit lead |
| Public bug bounty live + funded | continuous | audit lead + ops |
| Threat-model addendum kept in sync with deployed code | per upgrade | contracts |
| Quarterly "audit-results in summary" report | quarterly | audit lead |
| Annual review by a rotating community panel | annually | Captain |

---

## 4. Section 2 — Operational security

The eleven items below are the scope of operational security for a
protocol developed in the open. Each item gets a gate (if applicable)
and a standing commitment.

### 4.1 Repo posture

- **Branch protection on `main`:** required reviews ≥ 2 for canonical
  paths (`spec/`, `BRAND.md`, `THESIS.md`, `GROWTH.md`, `GLOSSARY.md`,
  `cargo/contracts/src/`); required CI green.
- **CODEOWNERS:** sensitive paths (contracts, deploy scripts, security
  docs, this file) require named owners.
- **Commit signing:** required for all merges to `main`. Sigstore /
  gitsign acceptable for OSS contributors without managed PGP.
- **OSSF Scorecard target:** ≥ 8.0 across all categories before mainnet.
  Repo wired to publish scorecard score in README.
- **Allstar policies enabled** (OSSF) for branch protection drift,
  binary artifacts, and admin-permission policies.

**Gates:** branch protection enabled; CODEOWNERS for sensitive paths;
OSSF Scorecard ≥ 8.0 published.

**Standing commitments:** Scorecard score reviewed monthly; drift
auto-triaged via Allstar; OpenSSF Best Practices Badge maintained.

### 4.2 CI/CD hardening

- **Pinned actions** — every third-party GitHub Action pinned to commit
  SHA, not version tag. Dependabot-style automation for SHA bumps.
- **Minimum-permissions `GITHUB_TOKEN`** — every workflow declares the
  minimum permissions block; default-readonly elsewhere.
- **OIDC for cloud auth** — no long-lived cloud credentials in repo
  secrets. OIDC federation for AWS / GCP / Azure if/when used.
- **Ephemeral runners** for any workflow that handles secrets.
- **No plaintext secrets** in workflows or matrix strategies.
- **`pull_request_target` audit** — every workflow that uses the
  privileged event reviewed by audit lead before landing.

**Gates:** all actions pinned to SHA; minimum-permissions enforced;
zero plaintext secrets in workflows; pre-mainnet `pull_request_target`
audit complete.

**Standing commitments:** CI security review on every workflow PR;
quarterly audit of pinned-SHA bumps for any vendor hijack signals.

### 4.3 Dependency / supply chain

- **Lockfile hygiene** — `yarn.lock` (TS sides) and `Cargo.lock`-style
  pins (Solidity tooling via Foundry) committed; lockfile-only changes
  reviewed for drift.
- **Renovate or Dependabot** wired for automatic PRs against
  dependency drift. Strawman: Renovate (more configurable; better
  monorepo support) — open question §8.4.
- **OSV-Scanner or Trivy** on every PR to flag known-CVE deps.
- **Socket / Endor Labs (commercial OSS plan) or OSV-only?** —
  open question §8.3.
- **SLSA target:** Level 1 minimum at mainnet; Level 2 commitment
  within 90 days post-mainnet.
- **Sigstore / cosign for release artifacts** — every released artifact
  signed; verification documented in release notes.

**Gates:** Renovate/Dependabot live; OSV-Scanner CI gate; SLSA L1
provenance attached to mainnet-deploy artifacts; release signing in
place before first mainnet-affecting release.

**Standing commitments:** weekly automated dep-PR review (named
reviewer rota); 14-day SLA on Critical / High CVE patches; SLSA L2 by
mainnet+90.

### 4.4 Secret scanning

- **Pre-receive secret scanning** via GitHub native secret scanning
  (free for public repos) AND a CI-side gitleaks or TruffleHog pass to
  catch patterns GitHub misses.
- **History scan** before mainnet — full git history scanned for any
  leaked secret in a deleted commit. Any finding triggers rotation +
  history rewrite.
- **Pre-commit hook** offered (not enforced) for contributors:
  detect-secrets or gitleaks pre-commit.

**Gates:** zero open secret-scanner findings on the mainnet-target SHA;
full history scan complete with all findings dispositioned (rotated
or accepted-as-non-secret).

**Standing commitments:** pre-receive scanning continuous; weekly
review of pre-receive blocked attempts; quarterly history re-scan.

### 4.5 General SAST (beyond smart contracts)

The TypeScript daemon (`client/src/**`) is unaudited as of v0. This is
a real surface — it handles keys, signs transactions, calls cross-chain
contracts. The mainnet gate must include SAST on the daemon and on
deploy-time scripts.

- **Semgrep / Opengrep** with the security ruleset on every PR. (Note:
  Semgrep moved to a paid tier for some advanced rules in 2025;
  Opengrep is the OSS-friendly fork maintained by Arnica.)
- **CodeQL** (free for public repos via GitHub Advanced Security) for
  TypeScript + Solidity.
- **Bearer** for data-flow + sensitive-data tracking on the TypeScript
  side (key handling, env var leakage).
- **AI-native general SAST**: ZeroPath or Aikido (commercial; both have
  OSS-friendly engagements). Open question §8.3.

**Gates:** Semgrep/Opengrep + CodeQL clean (zero High) on
mainnet-target SHA; AI-native pass run with findings triaged.

**Standing commitments:** SAST tools wired in CI for every PR;
quarterly review of triaged findings.

### 4.6 Code review process

- **PR templates** with security-affecting checklist (touches keys?
  touches contracts? touches CI?).
- **CODEOWNERS-driven reviewer routing** for sensitive paths.
- **Security-review trigger** on any PR that touches `cargo/contracts/`,
  `client/src/earning/`, `client/src/auth/`, deploy scripts, or CI
  workflows. Trigger means: audit lead or designated security reviewer
  is required, not optional.
- **AI code review augmentation** as opt-in second-pair-of-eyes:
  PR-Agent (OSS) or CodeRabbit (commercial OSS plan). Open question
  §8.3.

**Gates:** PR template live with security checklist; CODEOWNERS
configured for security-sensitive paths; security-review trigger
enforced via branch protection.

**Standing commitments:** monthly review of bypassed security-review
flags; quarterly PR-template revision based on lessons-learned.

### 4.7 Vulnerability disclosure

- **`SECURITY.md`** at repo root with: contact (security@jinn.network
  or equivalent), scope, response SLA (recommend 48h initial response
  / 14d triage / 90d disclosure window), embargo policy, safe-harbor
  statement.
- **Private reporting channel** — GitHub Security Advisories (free for
  public repos) as the primary intake; encrypted email backup.
- **GH Security Advisories CVE workflow** — CVEs requested for disclosed
  bugs that affect downstream consumers.

**Gates:** `SECURITY.md` live; private reporting channel monitored;
embargo / disclosure / CVE workflow documented.

**Standing commitments:** 48h initial-response SLA; 14d triage;
quarterly review of incoming reports.

### 4.8 Incident response

- **Runbook** at `docs/runbooks/incident-response.md` with:
  - Detection (alerts, monitoring, tip-offs)
  - Triage (severity matrix; on-call roster — **named** people, not
    "TBD")
  - Response (privileged-action playbooks per scenario: messenger swap,
    weights-to-zero, minter rotation, multisig key compromise)
  - Communication templates (status page, X post, GH Discussion,
    holder-comms email)
  - Post-incident review template
- **Tabletop exercises** — at least one full tabletop run before
  mainnet, simulating a Critical scenario from the v0 threat model
  (recommend §3.5 hostile messenger swap or §6.1 minter compromise).
- **Status page** — basic uptime + protocol-state status board live
  before mainnet.

**Gates:** runbook landed with named on-call roster; tabletop
exercise complete; status page live.

**Standing commitments:** quarterly tabletop exercise; runbook
revision after every real incident; status-page uptime ≥ 99.9% target.

### 4.9 Release security

- **Tagged releases** for the client daemon and contracts deployments,
  not just rolling-main deploys.
- **Signed release artifacts** via Sigstore / cosign (also covered in
  §4.3).
- **GitHub artifact attestations** (free tier; SLSA L2-compatible).
- **Release notes** call out security-affecting changes explicitly,
  with a "Security" header section.
- **Reproducible builds** — Foundry deterministic builds for contracts;
  pinned-Node + lockfile reproducibility for the daemon. Open question
  §8.5 (whether to commit to bit-for-bit reproducibility or
  metadata-equivalent).

**Gates:** first mainnet release is signed, attestation-attached, and
has explicit security-section release notes.

**Standing commitments:** every release ships signed + attested +
security-noted; quarterly review of supply-chain provenance.

### 4.10 Deploy / handover hygiene

- **Multisig key custody** — every signer's key is on a hardware
  device or a physically-separated air-gapped signer. Documented per
  signer (without revealing identity-bound info publicly).
- **Post-deploy verifier scripts** — every mainnet deploy step has a
  scripted verifier (e.g. `getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 0`
  asserted, ownership-transferred, etc.) that runs immediately and on a
  recurring schedule for the first 30 days.
- **Handover runbook executed on testnet first** — already a §3.4 gate
  (item 7); referenced here for cross-section traceability.
- **Address book** — public, documented, signed list of every
  authoritative address (multisig, governor, timelock, contracts) with
  the deploy commit + verification steps.

**Gates:** post-deploy verifier suite landed and tested on testnet;
multisig key-custody policy documented; address book published with
mainnet deploy.

**Standing commitments:** verifier suite re-run on a cron + monitored;
quarterly key-custody attestation from each signer.

### 4.11 Open-development specifics

The fact that the project is developed in the open changes the
threat surface beyond the code itself. This section makes that
explicit.

- **Public threat-model maintenance** — the threat-model addendum
  (mainnet-grade) is itself a public artifact that gets updated as
  contracts evolve. Edits go through CODEOWNERS-reviewed PRs.
- **Discussion-thread moderation** — the project's GitHub Discussions
  / forum needs a moderation policy (impersonation, social engineering,
  scams targeting holders). Recommend lightweight policy modelled on
  Ethereum Magicians / OZ Forum.
- **Issue / PR sanitisation** — contributors who paste logs or
  reproducers into issues / PRs will sometimes leak environment data
  (RPC keys, API tokens). Pre-receive secret scanning (§4.4) catches
  some; an explicit "what not to paste" section in `CONTRIBUTING.md`
  + a sanitising bot for logs is the additional layer.
- **Social-engineering exposure** — public maintainer accounts are
  high-value targets. Recommend: 2FA mandatory on all maintainer
  accounts; hardware-key auth where possible; passwordless preferred.
- **Sock-puppet / sybil reviewer detection** — for community reviewer
  programmes (WS-2, bounties), basic reviewer-vetting (account age,
  prior contributions, optional KYC for high-bounty tiers) reduces
  collusive findings.
- **Public DR / spec discipline** — when a discussion lands a
  decision, it lands as a DR (`log/decisions/`) or a spec, not just a
  comment thread. Otherwise the decision evaporates.

**Gates:** moderation policy live; `CONTRIBUTING.md` sanitisation
section live; 2FA + hardware-key requirement on maintainer accounts;
reviewer-vetting policy for community programmes documented.

**Standing commitments:** quarterly review of moderation incidents;
DR discipline audited monthly (count of "decisions reached in
discussion that didn't land as DRs").

---

## 5. Section 3 — Methodology + tooling research

This section is **research-driven**: the strawman shortlist below is a
first cut from a brief 2026-04-30 research pass, intended to be
sharpened by community input. Each category lists the candidate tools
with one-line rationale, license / cost notes, and an open question
where the strawman is genuinely uncertain.

The output of this section feeds Sections 1 and 2 — i.e. the tools
selected here are the ones we use to satisfy the gates and standing
commitments above.

### 5.1 Evaluation criteria

A candidate tool earns a place in the stack if it scores well on:

1. **OSS-friendly licensing** — preferred order: permissive OSS (MIT,
   Apache 2.0) > copyleft OSS (GPL, AGPL) > commercial with OSS plan >
   commercial. We will use commercial tools where the OSS option is
   materially weaker, but we want to know that.
2. **Public-development compatibility** — works against a public repo,
   findings can be triaged in public-or-private (own choice), no
   forced disclosure to vendor of source.
3. **CI / agentic integration** — usable as a non-interactive CI step
   AND/OR as an MCP-style tool callable by an agent (Claude Code,
   Cursor, etc.).
4. **Maintenance signal** — recent commits, responsive issue tracker,
   active community.
5. **Coverage diff** — does it find things the *other* tools in our
   stack don't? A tool that overlaps 95% with a free alternative isn't
   worth the integration cost.
6. **Cost** — sustainable for an early-stage protocol; preferably
   free-tier-meets-needs at this stage.

### 5.2 Strawman shortlist by category

Notation: **[OSS]** = open-source, permissively licensed;
**[OSS-GPL]** = open-source, copyleft;
**[Comm]** = commercial; **[Comm-OSS]** = commercial with OSS-friendly
free plan; **[Free-OSS-only]** = free for public repositories.

#### Category A — Smart-contract static + symbolic + FV

| Tool | License | Why | Use |
|---|---|---|---|
| Slither | [OSS] | Trail of Bits; industry standard; 80+ detectors | required (WS-1) |
| Aderyn | [OSS-GPL] | Cyfrin; Rust-based; complementary detectors; MCP server for AI integration | required (WS-1) |
| Halmos | [OSS] | a16z; bounded symbolic execution; Solidity-native | required (WS-1, WS-3) |
| Echidna / Medusa | [OSS] | Trail of Bits; property-based fuzzing | recommended for `JinnDistributor` |
| Foundry invariant suite | [OSS] | built-in; v0 stubs already in repo | required (WS-1) |
| hevm | [OSS] | dapp-tools; SMT-backed | recommended cross-check vs Halmos |
| Certora Prover | [Comm] | most mature commercial FV; the heavy artillery | open question §8.2 |
| KEVM | [OSS] | K-framework EVM semantics; rigorous but expensive | optional |

#### Category B — Smart-contract AI auditors

| Tool | License | Why | Use |
|---|---|---|---|
| Aderyn-MCP | [OSS-GPL] | bridges Aderyn into agentic LLM pipelines (Claude Code, Cursor) | required (WS-1) |
| Olympix Auditor | [Comm] | LLM auditor with detector library; coverage-diff vs Aderyn | strawman: required |
| Cyfrin Codex | [Comm] | Solidity-specialised LLM | strawman: optional, evaluate alongside Olympix |
| ChainPatrol | [Comm] | runtime + audit-time SC monitoring | optional |

Open question: which of Olympix vs Cyfrin Codex (or both) earns a slot.
Recommendation: pilot both on `JinnDistributor` and pick the one with
higher non-overlap findings.

#### Category C — General SAST (beyond smart contracts)

| Tool | License | Why | Use |
|---|---|---|---|
| Opengrep | [OSS] | Arnica's fork of Semgrep; OSS-friendly continuation | required (WS-1, §4.5) |
| Semgrep | [OSS-GPL/Comm] | original; some advanced rules paywalled | optional (free tier) |
| CodeQL | [Free-OSS-only] | GitHub Advanced Security; deep dataflow analysis | required (§4.5) |
| Bearer | [OSS] | data-flow + sensitive-data tracking | recommended for client/ TS code |
| Trivy | [OSS] | Aqua Security; broad scanner (deps, IaC, secrets) | required (§4.3, §4.4) |

#### Category D — AI-native general SAST

| Tool | License | Why | Use |
|---|---|---|---|
| ZeroPath | [Comm-OSS?] | LLM-native SAST; high recent profile (Aptos Labs case study); claims complement to Semgrep/Snyk | strawman: pilot |
| Aikido | [Comm-OSS] | bundles SAST + secrets + deps + container; OSS-friendly free plan | strawman: pilot |
| Mobb / Autofix Bot | [Comm] | autofix-focused | optional |
| Pixee | [Comm] | autofix; security-hardening PRs | optional (Java/Python/JS — limited overlap with our TS/Solidity) |

Open question §8.3: which of ZeroPath vs Aikido (or both) earns the
slot. Recommendation: pilot both for a 30-day window; pick on
findings-density and integration cost.

#### Category E — Secret scanning

| Tool | License | Why | Use |
|---|---|---|---|
| GitHub native secret scanning | [Free-OSS-only] | free for public repos; pre-receive | required (§4.4) |
| gitleaks | [OSS] | history + CI; mature | required (§4.4) |
| TruffleHog | [OSS] | high-entropy + verifier mode | recommended |
| detect-secrets (Yelp) | [OSS] | pre-commit hook; baseline-tracking | optional |

#### Category F — Dependency / supply chain

| Tool | License | Why | Use |
|---|---|---|---|
| Renovate | [OSS] | most configurable; monorepo-friendly | strawman: required (§4.3) |
| Dependabot | [Free-OSS-only] | GitHub native; less configurable | alternative |
| OSV-Scanner | [OSS] | Google; canonical OSV data | required (§4.3) |
| Trivy (deps mode) | [OSS] | broad scanner | required (§4.3) |
| Socket | [Comm-OSS] | malicious-package detection; runtime behaviour | strawman: pilot |
| Endor Labs | [Comm] | reachability analysis; reduces noise | optional |

#### Category G — Repo posture / OSS hygiene

| Tool | License | Why | Use |
|---|---|---|---|
| OSSF Scorecard | [OSS] | OpenSSF; 18+ checks; runs on every public OSS repo | required (§4.1) |
| Allstar | [OSS] | OSSF; policy enforcement (branch protection drift, etc.) | required (§4.1) |
| OpenSSF Best Practices Badge | [Free] | self-attested; signals maturity | recommended |

#### Category H — Signing / attestations / SLSA

| Tool | License | Why | Use |
|---|---|---|---|
| Sigstore + cosign | [OSS] | OpenSSF; keyless signing | required (§4.3, §4.9) |
| SLSA generators (GH Actions) | [OSS] | provenance attestations | required (§4.3) |
| GitHub artifact attestations | [Free-OSS-only] | SLSA L2-compatible; native | required (§4.3) |
| in-toto | [OSS] | supply-chain framework | optional |

#### Category I — AI code review augmentation

| Tool | License | Why | Use |
|---|---|---|---|
| PR-Agent (Qodo) | [OSS] | mature; supports Claude / GPT / Gemini; v0.32+ active | recommended (§4.6) |
| GitHub Copilot Autofix | [Free-OSS-only] | free for public repos via GHAS; integrates with CodeQL | required if available |
| CodeRabbit | [Comm-OSS] | OSS-friendly free plan; well-regarded review quality | strawman: pilot |
| Cursor Bugbot | [Comm] | Cursor's review agent; high autofix rate per Cloudflare write-up | optional (developer-IDE-side) |

Open question §8.3: which of PR-Agent + CodeRabbit configurations
becomes the default. Recommendation: PR-Agent in CI as the canonical
review (controllable, OSS, predictable cost via our own LLM keys);
Copilot Autofix opt-in for individual contributors.

#### Category J — Threat modelling

| Tool | License | Why | Use |
|---|---|---|---|
| OWASP Threat Dragon | [OSS] | diagram-driven; STRIDE | recommended (§3.4 mainnet threat-model) |
| PyTM | [OSS] | code-driven threat models | optional |

#### Category K — Fuzzing (general)

| Tool | License | Why | Use |
|---|---|---|---|
| OSS-Fuzz | [Free-OSS-only] | Google; free fuzzing infra for OSS | recommended for client/ TS-native libs (where supported) |
| libFuzzer / cargo-fuzz | [OSS] | language-native fuzzers | optional |

### 5.3 Integration plan

Tools selected from the strawman get integrated in this order, with
the goal that **by mainnet** the full stack is wired into CI and into
human review workflows:

1. **Week 0–4 (now → mainnet -12w):** Required CI gates. Slither,
   Aderyn, Halmos, Foundry invariants, OSV-Scanner, Renovate, gitleaks,
   GH native secret scanning, OSSF Scorecard, Allstar, Sigstore release
   signing.
2. **Week 4–8:** AI-augmented layer. Aderyn-MCP, Opengrep + CodeQL +
   Bearer in CI, ZeroPath / Aikido pilots, PR-Agent in CI.
3. **Week 8–12:** Formal verification (WS-3) + bounty + canary (WS-4).
   FV runs in parallel with the bounty's private window. Canonical
   messenger canary on testnet + mainnet verifier-only.

### 5.4 Tooling research: what stays open

These are the calls that **only the community discussion can sharpen**
because they are about feel, not analysis:

- ZeroPath vs Aikido vs both (Category D)
- Olympix vs Cyfrin Codex vs both (Category B)
- Renovate vs Dependabot (Category F)
- PR-Agent vs CodeRabbit vs both (Category I)
- Certora (free-for-OSS tier) vs Halmos vs hevm for `JinnDistributor`
  FV (Category A)

---

## 6. Engagement model — community plan reviewers

This section addresses a meta-issue: Alex, Andre, and others are being
asked to review **this plan** *and* may be reviewers **inside** this
plan (WS-2). That dual role needs structure.

### 6.1 Plan reviewers (this discussion thread)

Anyone with stake in Jinn's security posture is welcome to comment on
this plan in the GitHub Discussion (Appendix A). The strawman is open
for sharpening.

**Compensation for plan review:** none (pre-mainnet community work,
contributing to a public discussion). Credits in the published spec
when ratified.

**Disclosure:** none (the discussion is public).

**Crediting:** every reviewer who lands a substantive
suggestion-shaping-the-spec gets named in the ratified spec's
acknowledgements section (anonymous on request).

### 6.2 Audit reviewers (WS-2 inside this plan)

The structured engagement that pays per-finding:

- Per-contract review packet (one bespoke contract or a tightly-coupled
  pair).
- Engagement agreement covering scope, deliverables, comp, disclosure.
- 14-day private window after submission before public.
- Compensation per the model in §8.1.

### 6.3 Conflict of interest between roles

A reviewer who participates in §6.1 (plan review) is **not** prevented
from participating in §6.2 (audit review). They are different
engagements with different deliverables. The plan's structure should
not be informed by what would maximise a reviewer's audit fees, so
the plan-review channel asks reviewers to declare any audit
conflict-of-interest in their first comment.

---

## 7. Timeline

### 7.1 Hot-path

```
Week 0 (now):
  - This strawman ratifies (post-discussion).
  - WS-1 begins; Section 4 gates begin (repo posture, secret scan,
    SECURITY.md, etc.).

Week 2:
  - WS-2 reviewer recruitment + onboarding.

Week 4:
  - WS-1 deliverables complete.
  - WS-2 reviews begin (4-6 week window).
  - WS-3 formal verification engagement begins (in parallel with WS-2).

Week 8:
  - WS-2 deliverables complete; aggregation summary published.
  - All Section 4 gates verified.

Week 10:
  - WS-3 reports received; remediation pass begins.

Week 12:
  - WS-3 remediation re-checked clean.
  - WS-4 pre-mainnet private bounty (14-day window) opens.
  - Mainnet threat-model addendum landed.

Week 14:
  - WS-4 closes; mainnet deploy candidate.

Week 14+:
  - Mainnet community-formation gate (separate workstream) gates final
    deploy.
```

Slack of 2-4 weeks is realistic; plan to mainnet on Week 16-18 from
ratification. The lean stack drops ~8 weeks vs a firm-included gate.

### 7.2 Relationship to Phase A and mainnet community-formation

The audit + ops gate runs in parallel with Phase A (testnet campaign,
operator funnel) and the mainnet community-formation gate. Phase A
provides the funnel for community reviewers + bounty hunters. The two
mainnet-readiness gates (this one + community-formation) plus the
technical pre-flight (deploy verifier on testnet) compose the full
readiness check.

---

## 8. Open ratification questions

These are the calls that need a Captain answer, a community-discussion
answer, or both. Numbered for discussion-thread reference.

1. **Comp model for community audit reviewers (WS-2)** —
   (A) per-finding bounty / (B) flat consulting / (C) hybrid retainer
   + per-finding bonus. Recommend C; Captain ratifies amounts.
2. **Formal verification tool allocation** — Halmos (OSS) for all
   targets is the lean default. Certora's free-for-OSS tier is a
   plausible upgrade for `JinnDistributor` if the team has bandwidth
   to spec the rules. hevm is the dapp-tools alternative. Captain
   ratifies; community input welcome.
3. **AI-tooling pilot picks** — for Categories B, D, F, I in §5.2,
   which of the candidates are piloted and which are skipped. Community
   input is the central question here.
4. **Renovate vs Dependabot** (Category F) — recommend Renovate; minor
   call, community can flip.
5. **Reproducible builds commitment** — bit-for-bit (expensive,
   strong) vs metadata-equivalent (cheaper, weaker). Recommend
   metadata-equivalent at v0; bit-for-bit by mainnet+90.
6. **Phase 0 contracts** (`ClaimRegistry`, `AcceptAllChecker`) —
   change-impact only or full re-audit. Recommend change-impact.
7. **Disclosure window for community findings** — 14d (recommended),
   shorter, longer.
8. **Canary N for canonical messenger** — 100 testnet + 10 mainnet
   recommended; flex up to 1000 + 100.
9. **Mainnet threat-model addendum** — required gate (recommended) or
   soft commitment.
10. **Bounty platform** — Immunefi vs Code4rena vs Sherlock vs
    self-hosted. Cost-aware default: self-hosted via GH Security
    Advisories + a public payout pool; upgrade to Immunefi only if
    listing visibility justifies the platform fee.

## 9. Acceptance and follow-ups

This task ratifies the plan, not its execution. Follow-up bd issues
to file once the plan is ratified (the community discussion may
sharpen this list):

- WS-1 dispatch (mainnet-target SHA toolchain run)
- WS-2 dispatch (community reviewer recruitment + engagement)
- WS-3 dispatch (formal verification)
- WS-4 dispatch (bounty + canary)
- §4 ops gates: repo posture, CI hardening, dep/supply chain, secret
  scanning, SAST, code review, vuln disclosure, IR, release security,
  deploy/handover, open-dev — each as its own issue or grouped
- §5 tooling pilots: ZeroPath, Aikido, Olympix, Cyfrin Codex, PR-Agent,
  CodeRabbit (one per pilot, scoped 30 days)
- §3.4.9: mainnet threat-model addendum draft
- §8.1: comp-amounts decision for community audit reviewers
- §8.2: FV tool commitment
- §8.10: bounty-platform decision

## 10. Acknowledgements

To be populated in the ratified spec. Plan reviewers, drafters, and
community contributors who shape the strawman get named here unless
they request otherwise.

---

## Appendix A — Discussion-post draft

> Posted at: https://github.com/Jinn-Network/mono/discussions/62
> Title: "RFC: Mainnet security plan — strawman v0.1 open for community review"

---

**TL;DR.** Strawman security plan for Jinn's mainnet deploy and
standing post-mainnet posture is open for community review. Three
sections — **protocol security** (smart contract audit), **operational
security** (repo / CI / supply chain / disclosure / IR /
open-development hygiene), and **methodology + tooling research**
(which OSS / AI-native tools we adopt to do 1 and 2).

**Posture: lean by design.** No external commercial audit firm. We
believe modern AI tooling + community human review + formal
verification on critical contracts + a public bounty cover the audit
surface at a fraction of firm cost — and that this is the right
posture for a small team developing in the open in 2026. We expect the
same scrutiny as a firm-audited project, delivered by a different
combination of mechanisms. The plan is honest about that tradeoff.

Strawman lives at: [`spec/2026-04-30-security-audit-plan.md`](../spec/2026-04-30-security-audit-plan.md).

**Why this RFC.** Jinn is being developed in the open, and the
mainnet security gate is broader than a smart-contract audit. We want
this plan ratified by the same community that will help operate the
network — not just signed off by us.

**What we're asking.** Section-level comments on the strawman. The
specific points we most want input on:

1. **Lean by design.** No external commercial audit firm in the plan
   — modern AI tooling + community human review + formal verification +
   public bounty cover the audit surface at a fraction of firm cost. Is
   this defensible posture for Jinn at this stage? What would you add
   to compensate, or do you think the layered stack is enough?
2. **Section 1 — Protocol security.** Does the four-workstream layout
   (AI/static + community + FV + bounty/canary) make sense? What's
   missing or over-specified?
3. **Section 2 — Operational security.** Eleven items (repo posture,
   CI hardening, supply chain, secret scanning, general SAST, code
   review, vuln disclosure, incident response, release security,
   deploy/handover, open-development specifics). Any gaps? Anything
   you'd cut?
4. **Section 3 — Tooling research.** The strawman shortlist in §5.2 is
   our first cut. We are most uncertain about:
   - AI-native general SAST: ZeroPath vs Aikido vs both?
   - SC AI auditors: Olympix vs Cyfrin Codex vs both?
   - AI code review: PR-Agent vs CodeRabbit vs both?
   - Formal verification: Halmos vs hevm vs Certora's free-for-OSS
     tier for `JinnDistributor`?
   What have you used that should be on this list? What should come
   off?
5. **Section 6 — Engagement model.** If you're a reviewer who'd consider
   doing WS-2 (paid per-contract audit review), is the proposed
   structure (per-contract review packets, 14d disclosure, hybrid comp)
   workable? Note: WS-2 carries a two-reviewer-per-contract minimum to
   compensate for the absence of a firm pass. What would change to make
   it better?
6. **Section 8 — Open questions.** Ten open ratification points. Pick
   any that you have a view on.

**Process.** Open for at least 14 days. After that we ratify v1.0 of
the spec, file the follow-up bd issues for each workstream, and start
running. We'll respond inline; concrete suggestions that shift the
spec are credited in the ratified version's acknowledgements.

**A note on roles.** Some of you may end up as paid audit reviewers
(WS-2). Plan reviewers and audit reviewers are *different* engagements;
participating here doesn't disqualify you from WS-2. We do ask: if you
have a financial interest in any specific tool or vendor mentioned,
please disclose it in your first comment.

Direct any sensitive points to **GitHub Security Advisories** (or a
`security@` contact once stood up) instead of in-thread.

— Oak (audit lead, drafter)

---

End of strawman.
