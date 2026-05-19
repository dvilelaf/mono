# Changelog

## Unreleased

## v0.1.6 — Hermes Loop

_Released 2026-05-19_

# v0.1.6 — "Hermes Loop"

2026-05-19 · 48 PRs · 296 commits · 3 contributors

Hermes is live. An operator can join a SolverNet on Base Sepolia with the Hermes harness, pick a model from the dashboard catalog, and close the loop: claim → solve → deliver → get scored. The 2026-05-08 "evaluations silently broken" failure mode from v0.1.5 is demonstrably absent in v0.1.6 — verified end-to-end on real testnet with `verdictCode: 1` on a real sympy fix.

But the loop closing is downstream of a much larger story. v0.1.6 ships the first end-to-end builder workflow, the Network explorer, an admission substrate that makes evals actually trustworthy, and the per-harness auth cutover that decouples claim-loop liveness from harness-specific credentials.

## Highlights

### 🧩 Plug-in builder system — scaffold to chain in 60 seconds

The first release where a contributor can ship a SolverPlugin end-to-end without leaving the toolchain.

- **`jinn create plugin`** (#210) — scaffolds a working plug-in package (two patterns: SolverType plug-in or runtime plug-in) modelled on the production `swe-rebench-v2-runtime` package. New skeleton compiles, tests pass, ready to edit.
- **`jinn solver-plugins publish` + revoke** (#213) — packs the plug-in, uploads to IPFS, writes a `plugin:<cid>` record to the on-chain IdentityRegistry under the builder's agentId. Lazy Stage-1 identity bootstrap on first publish.
- **Ponder indexer for plug-ins** (#214) — `PluginPublication` entity + `plugin:*` MetadataSet handler + `PublishedArtifact` base. Plug-ins are discoverable across the network.
- **Discovery API REST routes** (#215) — five new `/v1/discovery/*` routes (plugin-publications, builder-artifacts, plugin-scores, launched-solvernets, claimable-tasks).
- **`/build` SPA page** (#216, #228, #292) — the canonical operator-app surface for builders. Lists published plug-ins for a SolverNet, your own published plug-ins under your builder agentId, the shape reference, and a quickstart. Designed against `DESIGN.md` tokens.
- **Discovery auth gate** (#227) — `/v1/discovery/*` routes get the same auth treatment as every other `/v1/*` daemon route.

A builder can today: scaffold → edit a skill → publish → see it appear on `/build` under their agentId → another operator installs it via `jinn solver-nets add-plugin` and the next task's signed envelope carries the plug-in CID in `executor.plugins[]`.

### 🌐 Network explorer

The data layer becomes visible. Operators and builders can finally see what's happening across the network.

- **Full explorer surface** (#181) — design, indexer schema/routes/enrichment, and the SPA. Network-level views of tasks, attempts, verdicts, operators, and plug-ins.
- **Solve-rate hero on Network view** (#251) — leads with the load-bearing metric.

### 🔬 SWE-rebench v2 eval substrate (fufn)

The work that made today's `verdictCode: 1` verification possible at all.

- **Eval admission + verdict-time substrate recheck** (#234) — operators maintain a validated pool of scorable instances; the generator only posts admitted instances; the evaluator re-verifies HF row hash + Docker image digest at verdict time. Reproducible verdicts; no more silently grading against drifted substrate.

### 🔐 Per-harness auth + claim-loop readiness (vh74.2)

The bootstrap stops being gated on Claude auth. Each harness reports its own readiness, and claim-loop refuses to attempt with an unready harness.

- **Per-harness readiness registry** (#248) — `claude-code-learner`, `codex-code-learner`, and `hermes-agent` each expose an `isReady()` snapshot via `/v1/harnesses/readiness` + `/v1/harnesses/:name/readiness`. Onboarding drops from 4 phases to 3 (no more "Sign in to Claude" step at bootstrap).

### 🚀 Hermes harness production-usable

The headline that named the release.

- **Hermes harness + model catalog** (part of #292) — 10 canonical models in the dashboard dropdown: Anthropic Opus 4.7 (default, OpenRouter), Sonnet 4.6, Hy3 Preview, DeepSeek V4 Pro / Flash, Gemini 3.1 Flash Lite, Kimi K2.6, Owl Alpha, MiniMax M2.7, Hermes 4 405B.
- **Harness-aware PluginPicker** (part of #292) — `claude-code-learner` is no longer force-included as a default plug-in when the operator picks Hermes (Hermes has its own learning loop).
- **Provider routing** (#298) — `<org>/<model>` model ids auto-route to OpenRouter, so the catalog actually works without operators manually editing their `hermes config.yaml`.
- **MCP launcher path resolution** (#299) — the `jinn-client` MCP server starts correctly in dev-layout installs, unblocking solution submission.

### 🏗 Bootstrap reliability (u34i / h74p / hjex.4 / 3nc5 / k1ng)

- **Bootstrap reliability stack** (#262, #275, #279, #237, #238, #255, #257) — gate+transfer parity, faucet/gate single source, `getCode` retry, panel auto-continue, harness-readiness holder, fresh-Safe race retry, `setAgentWallet` revert reason surfacing, Stage 1 `bindResult` narrowing, Docker stage copies docs.
- **One-shot funding + Tenderly default RPC** (#292) — operators send 0.020 ETH once; daemon doesn't re-prompt. Tenderly gateway replaces rate-limited `sepolia.base.org`. Shared-RPC panel warning with CTAs when on the bundled key.

### 🛤 Two-train release cadence (qlol)

- **Promote-main workflow + canary trigger** (#252, #253) — every push to `next` ships a `@canary` to npm; named-stable cuts trigger `npm @latest` + auto-FF of `main`. Handbook + CLAUDE + hotfix runbook updated.

### 📜 Canonical docs

- **PRINCIPLES.md** (#230) — privileged canon. Agents read it at session start; all decision-making runs through it.
- **BRAND + GLOSSARY** (#196) — builder-pitch learnings captured into canon.

### 🪲 Ghost-task floor (band-aid for #300)

Caught during the cut itself.

- **Backlog floor across all ingestion paths** (#301 + #303 + #305) — fresh operators on v0.1.6+ skip the 9 known pre-pool-rebuild ghost tasks on Base Sepolia. Three pieces because the band-aid surface had three call sites (adapter default, main.ts shadow, DiscoveryAPI consumption). #300 is the proper-fix investigation.

## Live verification

A3 closed end-to-end on Base Sepolia during the cut. Hermes-on-DeepSeek-V4-Flash produced a patch for `sympy__sympy-27510` ("Printing multiplication by negative number with custom (infix) function not correctly parenthesized"); the patch applied, the FAIL_TO_PASS tests passed, and Op A's evaluator scored it `verdictCode: 1`. Full transaction hashes and envelope CIDs in `log/decisions/2026-05-19-v0.1.6-stewardship.md`.

## Full changelog

### feat
- (#181) feat(ebu7): network explorer — design, indexer schema/routes/enrichment, SPA
- (#209) docs(52x3): plug-in builder entry point — spec + plan
- (#210) feat(et6s): `jinn create plugin` scaffold (two patterns)
- (#213) feat(1pbc): `jinn solver-plugins publish` + revoke — on-chain plug-in registry via setMetadata
- (#214) feat(attd): Ponder indexer — `PluginPublication` entity + `plugin:*` MetadataSet handler + `PublishedArtifact` base
- (#215) feat(ttz8): five Discovery API REST routes per spec §6.5
- (#216) feat(hfmf): `/build` SPA route + canonical `/docs/build/` tree
- (#251) feat(explorer): lead Network view with solve-rate hero

### fix
- (#227) fix(0nih): auth-gate `/v1/discovery/*` daemon API routes
- (#234) fix(fufn): SWE-rebench v2 eval admission + verdict-time substrate recheck
- (#237) fix(h74p): retry safe-binding to absorb fresh-Safe race window
- (#238) fix(hjex.4): surface `setAgentWallet` revert reason in `attention.hint`
- (#255) fix(3nc5): narrow Stage 1 `bindResult` before reading txHash
- (#257) fix(3nc5): Dockerfile build stage copies `client/docs/` for `/build` SPA
- (#262) fix(u34i): bootstrap reliability stack
- (#279) fix(k1ng): `setAgentWallet` retries on returned `ok:false`, not just thrown errors
- (#292) fix(u34i): post-bootstrap operator-app polish — Tenderly default RPC, one-shot funding, discovery holder, `/build` design, Hermes catalog, harness-aware PluginPicker
- (#298) fix(hermes): infer `--provider openrouter` from `<org>/<model>` model ids (closes #293)
- (#299) fix(hermes): inject `JINN_NETWORK_TOOLS_CLIENT_ROOT` into MCP server env (closes #294)
- (#301) fix(mech): bump Base Sepolia TaskCreated backlog floor past v3 pool rebuild (#300 band-aid pt.1)
- (#303) fix(mech): remove main.ts shadow of TaskCreated backlog floor (#300 band-aid pt.2)
- (#305) fix(mech): apply backlog floor to DiscoveryAPI candidates too (#300 band-aid pt.3)

### refactor
- (#140) refactor: rename `claude-code-learner` → learner + Hermes design docs
- (#174) refactor: solution envelope role schema
- (#212) refactor(nghf): staged bootstrap — fleet-level Stage 1 + `ensureStage1` / `ensureStage1And2` entry points
- (#228) refactor(gxuf): extract `PanelCard` to DRY `/build` SPA panel sections
- (#248) refactor(vh74.2): per-harness readiness registry + daemon-level Claude gate removal

### chore / release plumbing
- (#164) chore(2cl.21): bd-mirror writes Sprint iteration + human Epic options
- (#221) chore: sync main into next after current release
- (#226) chore(52x3): simplify epic surface (post-merge cleanup)
- (#252) chore(qlol): two-train plumbing — promote-main workflow + canary trigger
- (#253) docs(qlol): two-train cutover — handbook + CLAUDE + hotfix runbook
- (#256) chore(3nc5): bump client to v0.1.6 for the Monday cut

### canon
- (#196) canon: builder-pitch learnings in `BRAND` and `GLOSSARY`
- (#230) canonical docs: introduce `PRINCIPLES.md` as privileged canon

### test
- (#173) test: real two-operator corpus-read e2e on Anvil fork (incl. x402 USDC payment)
- (#224) test(r83r): reference plug-in + cold-start E2E acceptance gate
- (#275) test(u34i): tier-2 regression coverage — Playwright sequential-state E2E, late-mount lint, boundary tests

### docs
- (#306) docs(stewardship): READY-FOR-CUT decision-log entry for this cut

### other
- (#232) codeowners: drop @ritsuKai2000 (secondary account) from canon ownership

## Known issues / v0.1.7 follow-ups

v0.1.6 ships three band-aid patches in the floor stack (#301 + #303 + #305) for the ghost-task class. Each has a paired investigation issue framed as "understand the code first, then propose":

| Issue | Class | What |
|-------|-------|------|
| #295 | catalog schema | Provider as a first-class field on `LearnerModelOption`. Replaces the regex inference in #298. |
| #296 | plugin layout | Per-task plugin-mount audit. Replaces the env injection in #299. |
| #297 | test surface | Real-Hermes E2E test shape. Stub-based E2E missed the bug classes caught live. |
| #300 | admission | Ghost-task class — symmetric solver-side admission filter, contract-side `cancelTask`, self-bumping floor anchored to pool `updatedAt`. Replaces the three-piece floor band-aid. |
| #302 | harness layer | `codex-code-learner` session-start hook missing on dev-layout install. |
| #304 | CI hygiene | `transcript-watcher.test.ts > shutdown stops further dispatches` — 8s `waitFor` times out under CI load. |
| #307 | release process | qlol cutover removed the holistic-review-at-main gate. Investigate restoring it. |

## Stats

- Window: v0.1.5 → next HEAD (`92ba5361`)
- 296 commits · 48 PRs · 466 files changed, +66,489 / −1,446
- 3 contributors

🤖 Generated with [Claude Code](https://claude.com/claude-code)


<!-- jinn-release-evidence:v1
release-tag=v0.1.6
release-commit=579541cd7fefe305289a51b0ac5da19587e00ad2
release-client-prepare=passed
donation-consumption=skipped:#310
app-first-testnet-acceptance=passed
-->

## v0.1.5 — Operator App

_Released 2026-05-13_

# v0.1.5 — "Operator App"
2026-05-13 · Suggested bump: patch (first npm `@latest` cut that ships the app-first operator experience)

## Highlights

- Release plumbing fixed so the cut can actually ship. `npm-publish.yml` now installs `contracts/` before the operator gate, the Docker/GHCR workflow accepts the new `v<semver>` tag format alongside legacy `client-v*`, and the CHANGELOG mirror writes through a PR (no more failed direct push to protected `main`).
- SWE-rebench v2 verdict path is structurally correct end-to-end. The eval loop no longer emits verdicts on non-gradeable evals (uy6v.8), the daemon's `verdictCode` default is `Invalid`, not `Pass` (uy6v.7), evaluator-side gating now surfaces a real verdict so the reputation feedback hook fires (uy6v.10), and the `evaluation:<cid>` MetadataSet is published on verdict delivery (n93o).
- Per-operator disks no longer fill in a couple of weeks. The SWE-rebench v2 eval-image cache is bounded by an in-process LRU (uy6v.11).
- Operator app feedback on issue 188 addressed across overview / launcher / catalog / configuration / shell, with dashboard tests refreshed.
- Daemon execution envelope now carries the executor model (`gbut`), giving downstream consumers the model that produced each Solution / Verdict.
- Discovery API no longer 404s for just-launched manifests when no subgraph is configured (#170) — important for fresh launcher records.

## Recovery context

v0.1.4 published as a GitHub Release at `fa8da678` but the npm-publish workflow failed before publish in `release:operator-gate` because contracts dependencies were not installed in the clean Actions checkout. The fix landed as PR #187 *after* the v0.1.4 tag was created, so the v0.1.4 release commit could not retry publish. v0.1.5 cuts from current `main` (`56e84952`) which includes that fix; `@jinn-network/client@latest` becomes `0.1.5` (replacing the stale `0.1.2`). v0.1.4 remains as a Build Notes Release; no `0.1.4` npm artifact exists.

## Changes

### feat
- (#189) feat(uy6v.11): bound swe-rebench-v2 eval-image cache with in-process LRU — @ritsuKai2000
- (#194) feat(gbut): publish executor.model in jinn.execution.v1 envelope — @ritsuKai2000

### fix
- (#170) fix: /v1/solvernets/registry/:cid 404s for just-launched manifests when no subgraph is configured — @ritsuKai2000
- (#183) fix(uy6v.8): SWE-rebench v2 eval loop — no verdicts on non-gradeable evals; source-only patches — @ritsuKai2000
- (#185) fix(release): unblock v0.1.4 publish — @ritsuKai2000
- (#187) fix(release): install contracts before operator gate — @ritsuKai2000
- (#190) fix(uy6v.10): emit verdict in swe-rebench-v2 gating so reputation hook fires — @ritsuKai2000
- (#193) fix(uy6v.7): daemon verdictCode default — Invalid not Pass — @ritsuKai2000
- (#197) fix(n93o): publish evaluation:<cid> MetadataSet on verdict delivery — @ritsuKai2000

### chore
- (#208) chore(2cl.20): bump client/package.json to 0.1.5 — @ritsuKai2000

### docs
- (#165) docs: clarify terminal unresolved verdicts — @ritsuKai2000
- (#195) docs(uy6v.6): DR — keep self-eval bypass on testnet; revert is a mainnet gate — @ritsuKai2000

### test
- (#168) test: Real-daemon Playwright e2e: lifecycle + operator catalog + empty states + crash recovery (scenarios 2-5) — scenarios 2-4 — @ritsuKai2000
- (#207) test: align verdict code fallback expectation — @ritsuKai2000

### other
- (#192) [codex] address operator dashboard issue 188 feedback — @ritsuKai2000

## Closed this week

- jinn-mono-uy6v.8 (SWE-rebench v2 eval loop — verdicts on non-gradeable evals)
- jinn-mono-uy6v.6 (DR — keep self-eval bypass on testnet)
- jinn-mono-uy6v.9 (Unscorable instances in dataset — quantified)
- jinn-mono-2cl.20.1 (Discovery-stack scope mismatch before release draft)

## Stats

- Window: v0.1.4 → HEAD (2026-05-13)
- 14 commits · 72 files changed, 4444 insertions(+), 772 deletions(-) · 15 PRs · 1 contributor

## Known issues

- jinn-mono-uy6v.7 (Live verdict-success + JINN reward distribution): in_progress. Verdict path is now structurally correct and emitting, but live observation of JINN reward distribution to operator wallets is still gating the v1 public-testnet ship (separate from this Build Notes cut).
- jinn-mono-uy6v.10 (Reputation-feedback hook): PR #190 makes the feedback hook fire on swe-rebench v2 verdicts; live on-chain registry update observation still pending closure.
- jinn-mono-uy6v.11 (Eval-image cache): PR #189 bounded the cache via in-process LRU; long-running operator disk validation still pending closure.

<!-- jinn-release-evidence:v1
release-tag=v0.1.5
release-commit=56e849525ebdbc8efc5a99a8255cead613ef7d80
release-client-prepare=passed
donation-consumption=passed
app-first-testnet-acceptance=passed
-->

## v0.1.4 — Shipping Machine

_Released 2026-05-12_

2026-05-12 · Suggested bump: patch (Captain: override to vX.Y+1.0 if an epic closed in this window)

### Highlights
- Operator onboarding: `jinn run` now owns first-run setup, including keystore-password generation and app-driven Claude sign-in for bare-host operators.
- Discovery API and hosted-subgraph removal: the client now follows the on-chain-first path from the merged 280n stack.
- Engineering handbook v1: the shipping-machine SOP, release-note scaffold, cadence correction, and Run-mode chore conventions are now exercised by a real cut.
- SWE-rebench v2 donation prep: package and gate work for donated execution-data consumption is included, with release gates run before publish.

### Changes

#### feat
- (#63) feat(client): Phase A.2 plug-in surface — @jinn-network/restorer-sdk + Path 1 slot registry + 9 worked examples — @ritsuKai2000
- (#139) feat(2cl.16): auto-close bd issues referenced in merged PR body — @ritsuKai2000

#### fix
- (#131) fix: purge canonical-plugin traces from operator surfaces (jinn-mono-l2zl.15.4.2) — @ritsuKai2000
- (#132) fix(2cl.13): correct bd JSON field references in bd-mirror — @ritsuKai2000
- (#147) fix: friday-triage.yml YAML parse error (embedded python dedent) — @ritsuKai2000
- (#149) fix(2cl.19): Monday scaffold — squash-merge enumeration + stats line + closed-bd list — @ritsuKai2000

#### refactor
- (#153) refactor(280n): land #138/#150 hosted-subgraph removal stack — @ritsuKai2000

#### chore
- (#133) chore(2cl.6): dual-tag releases with v2026.MM.DD alongside v<semver> — @ritsuKai2000
- (#135) chore(2cl.7): harden release gates without slowing canary — @ritsuKai2000
- (#136) chore(2cl.15): allow .claude/skills/ to be tracked in git — @ritsuKai2000
- (#137) chore(2cl.17): document Run-mode declaration convention — @ritsuKai2000
- (#148) chore: drop bd-close-on-merge workflow (manual bd close suffices) — @ritsuKai2000
- (#152) chore: prep v0.1.4 release — @ritsuKai2000

#### docs
- (#66) docs: reconcile Phase 1b roadmap under Phase A umbrella — @ritsuKai2000
- (#128) docs: engineering handbook v1 design + engineering-substrate DR — @ritsuKai2000
- (#146) docs: spec — realign GROWTH §3 around ecosystem builders on the leading open agentic harness + ERC-8004 — @oaksprout

#### test
- (#89) test(engine): cross-impl artifact-row invariant (jinn-mono-6ig7) — @ritsuKai2000

#### other
- (#61) Fix npm publish workflow Foundry setup — @ritsuKai2000
- (#64) Phase A.1: corpus library + gating fix + manifest hygiene + sha256 cache + MCP rewiring — @ritsuKai2000
- (#65) Automatic Base Sepolia earning setup migration — @ritsuKai2000
- (#70) Growth skill stack: cluster-model, growth-watcher, twitter-strategy, growth-day, plus canon promotions — @oaksprout
- (#71) [codex] Improve operator onboarding dashboard flow — @ritsuKai2000
- (#72) [codex] Complete Task and SolverNet migration — @ritsuKai2000
- (#73) growth-day auto-invokes stale feed routines + freshness stamps — @oaksprout
- (#74) Glossary: JINN/veJINN casing rules; ignore growth recruitment docs — @oaksprout
- (#75) [codex] Add one-click Claude Code install — @ritsuKai2000
- (#76) [codex] Implement task-native SolverNet lifecycle — @ritsuKai2000
- (#77) [codex] Implement prediction SolverNet v1 SDK surface — @ritsuKai2000
- (#78) [codex] Deliver Prediction SolverNet task lifecycle phase — @ritsuKai2000
- (#79) [codex] Add Prediction SolverNet Brier scoreboard — @ritsuKai2000
- (#80) Prediction SolverNet operator UX diagnostics — @ritsuKai2000
- (#81) [codex] Surface Prediction dashboard status — @ritsuKai2000
- (#82) [codex] Add Network Tools prediction learner plugins — @ritsuKai2000
- (#83) growth: 2026-05-04 recruit log + Tier A/B/C ranking for growth-day — @oaksprout
- (#88) Operator app: Overview + Configuration page split (operator-shakedown) — @ritsuKai2000
- (#90) growth-day: enforce active-sprint precondition + warm-contacts ladder — @oaksprout
- (#91) Add jinn-adjacent cluster frame and Sprint #1 recruitment learnings — @oaksprout
- (#93) SPEC: tokenomics; canonical-doc process via GitHub Discussions — @oaksprout
- (#94) plugin: simplify claude-code-learner + decouple from Jinn vocabulary — @ritsuKai2000
- (#95) growth: canonical restructure — populate §3, add GTM/channel/sprint sections, cluster-aware skills — @oaksprout
- (#101) [codex] add jinn activity tabs — @ritsuKai2000
- (#102) Agent-harness SolverNet: freeze-mode + SWE-rebench v2 + train/frozen leaderboard — @ritsuKai2000
- (#104) growth: §3 niche+pitch+bridge rewrite, §6.1 token-tolerance rule (PMF-search refinement) — @oaksprout
- (#106) growth: pin §7 currently-testing to swe-rebench v2 (follow-up to #104) — @oaksprout
- (#107) growth: §3 tighten to OSS coding agent contributors + pin swe-rebench v2 + skill hardening — @oaksprout
- (#108) growth + decision: lock swe-rebench v2 as the operational launch SolverNet (DR-2026-05-07-h) — @ritsuKai2000
- (#109) Plan 4 Phase 0+1: capture envelope schema + OTLP receiver + scrub processors — @ritsuKai2000
- (#111) growth: §5 Engage — three ways in → four ways in (contributor) — @oaksprout
- (#112) Revise README for clarity and additional instructions — @oaksprout
- (#121) brand: canonical introduction + stake-claiming voice rule — @oaksprout
- (#123) [codex] Implement telemetry capture publish and readable donation path — @ritsuKai2000
- (#124) Prepare SWE-rebench v2 donation flow for public testnet — @ritsuKai2000
- (#125) Fix canary packaging and daemon liveness blockers — @ritsuKai2000
- (#126) Prepare SWE donation flow for public testnet release — @ritsuKai2000
- (#127) Fix SWE typed payload fallback validation — @ritsuKai2000
- (#134) discovery: DiscoveryAPI interface + OnchainDiscoveryAPI floor + callsite migration — @ritsuKai2000
- (#172) Fix Docker acceptance build context — @ritsuKai2000
- (#184) Fix Docker testnet acceptance gate — @ritsuKai2000

### Closed this week
- jinn-mono-280n.1
- jinn-mono-2cl.13
- jinn-mono-2cl.15
- jinn-mono-2cl.16
- jinn-mono-2cl.17
- jinn-mono-2cl.19
- jinn-mono-2cl.6
- jinn-mono-2cl.7
- jinn-mono-9a4d
- jinn-mono-pgjj
- jinn-mono-uy6v.7

### Stats
- Window: client-v0.1.3 → HEAD (2026-05-12)
- 122 commits · 1278 files changed, 189811 insertions(+), 37079 deletions(-) · 58 PRs · 2 contributors

### Operator-facing notes
- A brand-new operator can run `jinn run` with no env var, no setup, and no input; the daemon now generates a local keystore password when needed and opens the app while bootstrap continues.
- Host operators sign in through the app with `Sign in with Claude`; Docker/container modes still surface the appropriate CLI command because the daemon cannot reach the operator's host browser.
- The old `jinn quickstart` verb has been removed; `jinn run` is the supported zero-to-running path.

### Known issues
- The v1 public-testnet milestone (`jinn-mono-uy6v`) is not included in this cut; it remains the next major waypoint, with open P0 work still tracked separately.
- This is a weekly patch Build Notes release, not a v1 graduation or the `jinn-mono-uy6v` milestone.

## 0.1.3

- Added the v0 testnet cross-chain JINN claim loop, including bundled Sepolia/Base Sepolia MVI deployment artifacts, MockMessenger burn-in support, and canonical OP-Stack verifier canary tooling.
- Added Safe v1.3 inner-revert decoding so permanent claim and delivery races stop retrying with generic `GS013` errors.
- Updated bundled Phase 1b deployment defaults for the proxy-deployable V2 activity checker and JINN MVI testnet stack.
- Added release-gate coverage for contract tests, storage-layout drift checks, and Foundry invariant harness compilation.
- Hardened the local operator release gate for the current adapter API, ERC-8004 stubbed subgraph surface, and forked-chain `setAgentWallet` deadlines.
- Switched the docker testnet acceptance gate from legacy health-check intents to the auto-generated `prediction.v0` loop. The gate now requires both restoration and evaluation success per cycle, gates on cycles produced after `runStartAt`, and uses tighter cycle-shaping params (`JINN_PREDICTION_V0_WINDOW_MS=120000`, `JINN_PREDICTION_V0_RESOLVE_GAP_MS=60000`) so a full restoration→delivery→evaluation→claim round-trip lands inside the 20-minute timeout.

## 0.1.2

- Replaced the `mech-client-ts` IPFS upload dependency with the client’s own Autonolas registry upload path, reducing the packed install footprint and removing the deprecated js-IPFS transitive chain from the release artifact.
- Updated the optional Coinbase CDP SDK used for testnet faucet support.
- Added `jinn intents enable --impl <name>` plus `jinn intents reset <kind>` so operators can switch intent implementations without hand-editing config.
- Removed the default legacy health-check desired state; testnet now relies on the deterministic auto-generated `prediction.v0` intent path by default.
- Added graceful legacy Claude skip behavior (`claude_unavailable`) when auth/quota blocks health-check restoration attempts.
- Fixed no-install invocation so `npx @jinn-network/client@<version> <verb>` works directly via a `client` bin alias.
- Added canonical `jinn mcp` command and kept `jinn-mcp` as a deprecation shim.
- Extended package smoke tests to validate both direct `npx` and legacy `npx -p ... jinn ...` execution paths.
- Includes prior validated canary fixes now rolled into stable:
  - PR #21 default Base Sepolia ClaimRegistry
  - PR #22 idempotent replayed `claimDelivery`
  - PR #23 prediction evaluator support for signed engine manifests
