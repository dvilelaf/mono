# Plug-in and harness network trust — registration, discovery, feedback, and revocation

- **Date:** 2026-05-05
- **Author:** opus (drafted on jinn-mono-morq; Captain ritsukai)
- **Status:** Proposal
- **Version:** 0.1
- **Tracks:** Phase A.2 follow-up — closes the network-registration gap left by the plug-in-surface spec
- **Beads:** jinn-mono-morq

**Sibling specs (load-bearing pre-reads — this spec composes with them, does not redesign them):**

- `spec/2026-04-30-plug-in-surface.md` — Phase A.2 plug-in/harness surface this spec extends with network-side trust
- `spec/2026-05-executor-trust-boundary.md` — Path 2 harness trust contract; this spec adds the network-visible registration surface §5.6 forward-pointed to
- `spec/2026-05-01-harness-pack-architecture.md` — vocabulary source for "harness" (replaces `RestorerImpl`)
- `spec/2026-04-30-phase-a-umbrella.md` — Phase A roadmap context
- `docs/superpowers/specs/2026-04-27-erc-8004-entity-model-design.md` — ERC-8004 IdentityRegistry shape this spec extends
- `spec/2026-04-30-knowledge-market-vision-discussion.md` — knowledge-market posture (headless brand; no central marketplace)

**Discussion lineage:**

- [#59](https://github.com/Jinn-Network/mono/discussions/59) — knowledge-market roadmap (Phase A.2)
- [#62](https://github.com/Jinn-Network/mono/discussions/62) — security audit RFC (adjacent threat-modeling)
- [#57](https://github.com/Jinn-Network/mono/discussions/57) — paired GTM around prediction SolverNet

---

## TL;DR

The plug-in surface spec defined how external builders ship code into Jinn (Path 1 plug-ins into the bundled `claude-code-learner` harness; Path 2 harnesses as full-package alternatives). It deferred the network-registration question. This spec answers it for v0 with a deliberately lean shape, calibrated against the field's actual posture: **no production LLM-agent harness in the survey shipped a real trust gradient; the field standard is "disclaimer + content-pin + user vigilance."**

Five defenses (operational v0):

1. **Disclaimer** — including OS-level sandbox guidance for the daemon
2. **Content-hash binding** on operator-initiated installs (kills MCPoison-class post-approval-mutation attacks)
3. **Bash refuses package-install commands** (closes a novel threat: autonomous install via corpus learning)
4. **Recommendations queue** (preserves the learner's value without the autonomy that creates the threat)
5. **Existing capability handles for Path 2 harnesses** (already shipped per trust-boundary spec)

Three discovery layers:

- **D1** local operator config (already exists)
- **D2** opt-in publish-on-install attestation via ERC-8004
- **D3** `jinn plug-ins discover` / `jinn harnesses discover` reading followed-attestor attestations

One feedback surface: a single ERC-8004 attestation schema, four operator verbs (`endorse` / `warn` / `block` / `review`), shared between plug-ins and harnesses.

Three revocation operations: operator-side `disable` (already exists / extend), negative attestations as advisory (the `warn` / `block` feedback kinds), `jinn plug-ins status` to surface advisories from followed attestors.

Trust gradient (vocabulary aligned with ERC-8004's `supportedTrust`): four tiers declared; only Tier 0 (self-built) and Tier 1 (signed-by-trusted) operational v0; Tier 2 (community-reviewed) and Tier 3 (sandboxed-only) reserved as schema enum, deferred to Phase B.2 evaluator economics and out-of-process executor respectively.

Engineering estimate: ~5 weeks for one engineer.

---

## 1. Purpose and scope

### 1.1 In scope

- Threat model for builder code reaching operator runtimes via the network
- Trust gradient (Tier 0–3) using ERC-8004's `supportedTrust` vocabulary
- Defense layers operational in v0 (disclaimer / content-hash binding / autonomous-install block / recommendations queue / existing capability handles)
- Discovery surface (operator config + ERC-8004 attestations + CLI commands)
- Feedback surface (operator publishes `endorse` / `warn` / `block` / `review` attestations on plug-ins and harnesses)
- Revocation surface (operator-side disable + negative attestation advisory)
- ERC-8004 schemas for installation attestations, feedback attestations, and review references
- CLI verb additions and behavioral changes
- Disclaimer text shipped in daemon first-run output and quickstart docs

### 1.2 Out of scope

- Implementation of CaMeL dual-context architectural defense for prompt-injection-via-plug-in (research-grade; deferred until incidents force the lift — see §10)
- Registration-time manifest linter (Glama-style scoring; deferred — §10)
- Builder bonding / slashing (needs Phase B.2 evaluator-economics infra)
- Named-reviewer reputation set with stake (needs Phase B.2)
- Tier→reward-eligibility coupling in `RestorationActivityChecker.sol` (Phase B.2 contract change; named here as the specific N2-fix path)
- Tier 3 sandbox enforcement (needs out-of-process harness executor; Phase 2+)
- Centralized marketplace, curated allowlist, or staff-reviewed badge (not Jinn's posture; headless-brand decision per `BRAND.md`)

### 1.3 Non-goals

- **Replace operator vigilance with protocol enforcement.** v0 is honestly a layer of disclosure + advisory primitives. The protocol does not stop an operator from installing a plug-in their followed attestors flagged.
- **Provide cryptographic proof of plug-in safety.** No analysis tool yet does this for LLM-driven harnesses; the survey confirmed every major LLM-agent vendor (Anthropic, Google, Cursor, OpenAI, Block) ships less than what we ship here.
- **Match marketplace UX of VS Code / MetaMask Snaps.** This spec doesn't ship a web-facing marketplace; the discovery surface is CLI + on-chain primitives consumed via the operator's followed-attestor set.

---

## 2. Threat model

### 2.1 Attacker classes

Six attacker classes are in scope:

| Class | Description | Closed in v0 by |
|---|---|---|
| **A — Malicious-on-publish** | Builder publishes hostile code aimed at adoption | Disclaimer + feedback attestations from operators who detect harm |
| **B — Compromised-builder** | Honest builder's npm token / signer / CI is compromised | Sigstore evidence on Tier 1 manifests + content-hash binding |
| **C — Typosquatter / impersonator** | `@jiinn-network/...` published to capture mistaken installs | ERC-8004 attestations from followed attestors (typosquats accumulate no attestations from trusted sources) |
| **D — Supply-chain transitive** | Plug-in honest; one npm dep compromised | Inherited from Discussion #62 supply-chain workstream; not redesigned here |
| **E — Network-side discovery poisoning** | Attacker sybils ERC-8004 to drown out signal | Followed-attestor model — operators consume attestations from sources they explicitly trust, not aggregate counts |
| **F — Hostile-on-update** | Plug-in good at install, hostile after update | Content-hash binding (mutation forces re-approval) |

### 2.2 Asset classes

**Defended in v0:**

- *a1* — Operator filesystem and secrets (keystore, env vars, MCP server tokens)
- *a3* — Operator wallet funds (ETH for gas, OLAS bond, USDC float)
- *a5* — Operator reputation (poisoned forecasts under operator's signed envelope)
- *b1* — Output integrity (fraudulent `restorationPayload` / `verdictPayload`)
- *b2* — Capability allow-list scope (Path 2 harnesses cannot widen via manifest tampering)
- *n1*–*n4* — Namespace identity, discovery channel integrity, update channel integrity

**Acknowledged but not actively defended:**

- *a2* — SQLite store integrity (covered by store hygiene; not network-trust-specific)
- *a4* — Outbound network egress (covered by Discussion #62 op-sec workstream)
- *b3* — `implStateDir` / `workingDir` writes (already bounded by capability handles)
- *n5* — Registry censorship (governance question; ERC-8004 itself is on-chain so Jinn cannot censor)

### 2.3 Novel threat — N4: autonomous install via corpus learning

The `claude-code-learner` is a *learning* harness: it reads the corpus to mimic and adapt successful prior approaches. The Execute phase has Bash. Without a defense, a corpus debrief artifact recommending plug-in `@foo/bar` causes the harness to autonomously `yarn add @foo/bar` + `jinn plug-ins add @foo/bar` — bypassing every operator-side trust gate, every install dialog, every content-hash check, every disclaimer.

**Sybil attack on the corpus** is the load-bearing exploit: poison the corpus with debrief artifacts that praise typosquat plug-in `@jiinn-network/forecaster` (note the doubled `i`). The learner reads the corpus and auto-installs the typosquat across every operator running the same intent kind. **One sybil-poisoned corpus = mass compromise**, exactly the Gemini CLI CVSS-10 pattern (autonomous mode + auto-trust + embedded instructions), with the network's shared corpus replacing the local workspace.

This threat is unique to a learning agent that consumes a shared corpus. The wider LLM-agent ecosystem hasn't had to face it because most LLM-driven extensions read from local files only, not from a network-shared knowledge market. **Closed in v0 at the Bash boundary** (§3.3); this is the most important new defense in this spec.

### 2.4 N1 acknowledgement — prompt-injection via plug-in (host-inheritance)

Path 1 plug-ins run inside the LLM-driven harness with full Bash / Read / Write / Skill / Agent / MCP access. A capability allow-list stops the plug-in's *agent file* from doing forbidden things, but does nothing against the harness *deciding* to call a permitted capability after being socially engineered by hostile manifest text or returned tool data. The survey's CVE record (Cursor CVE-2025-54136, Cursor CVE-2025-54135, Sourcegraph Cody GHSA-8wmq-fwv7-xmwq, Amazon Q AWS-2025-019, Anthropic Git MCP CVE chain, Trail of Bits prompt-injection-to-RCE in three coding agents 2025) demonstrates this is a class of attacks the entire LLM-agent ecosystem has not solved at the architectural level.

The architectural defense (CaMeL-style dual-context — privileged outer loop never receives plug-in output directly; only a quarantined sub-agent does, and the quarantined agent has no capability to call other plug-ins) is research-grade and multi-week. **v0 explicitly does not ship this defense.** §10 names the trigger condition that escalates it from a deferred seam to a v1 defense.

### 2.5 N2 acknowledgement — operators positively incentivized to install risky plug-ins

Operators run the daemon to *earn money*. Successful restorations produce JINN rewards (and OLAS staking rewards via the activity checker). The operator's job is to maximize earnings. A MetaMask Snaps user installing a Snap has no positive incentive — they install for utility, weighed against risk. **A Jinn operator does have a positive incentive**, so a "be careful with third-party Snaps"-style disclaimer carries less behavioral weight than it does in a wallet context.

Concretely: a builder publishes `@some-builder/awesome-forecaster` that earns more JINN per week than the bundled forecaster for two weeks; the operator's wallet says *this is great*; the disclaimer says *be careful*; the wallet wins. Then on week three the plug-in starts producing slightly worse forecasts on high-stakes intents specifically, drains the operator's USDC float, exfiltrates the keystore, or causes a stake slash via challenged evaluations.

**v0 accepts this risk.** The disclaimer protects Jinn from being blamed; it does not prevent the harm. The specific fix path is named in §10: **tier→reward-eligibility coupling in `RestorationActivityChecker.sol`** so that low-tier plug-ins' deliveries do not count toward staking-reward eligibility. That's a scoped contract change shipped if and when N2-shaped harm is observed; it is not pre-emptively built.

---

## 3. Defense layers

Five defenses operational in v0. Each is calibrated against the field standard rather than maximum theoretical security.

### 3.1 Disclaimer

The canonical disclaimer text is shipped in:

- `client/docs/path-1/quickstart.md` (existing — extended)
- `client/docs/path-2/quickstart.md` (existing — extended)
- `client/docs/security.md` (new)
- The daemon's first-run output (when the operator runs `jinn run` and the keystore-generation flow completes)
- `jinn plug-ins add` and `jinn harnesses add` print a one-line abridged version on every successful install: *Reminder: Jinn does not audit third-party code. You are responsible for evaluating each plug-in's source. Run the daemon in an isolated environment.*

The canonical text is reproduced verbatim in §11 and the abridged version is reproduced there as well.

### 3.2 Content-hash binding

The existing `jinn plug-ins add` and `jinn harnesses add` verbs (per `2026-04-30-plug-in-surface.md` §4.4 and `2026-05-external-restorer-impls.md` §7.2) extend with content-hash binding:

1. On `add`, the daemon computes:
   - `manifestHash` — sha256 of the canonical-JSON-encoded `jinn-plugin.json` (Path 1) or signed manifest (Path 2)
   - `tarballHash` — sha256 of the package tarball as resolved from the npm registry / lockfile
   - `entryPointHashes[]` — sha256 of each file referenced by `slots[].entry` (Path 1) or `manifest.entry` (Path 2)

2. The hashes are recorded in `~/.jinn-client/installed-plug-ins.json` (Path 1) and `~/.jinn-client/installed-harnesses.json` (Path 2) alongside the existing config entries.

3. At session start, the loader recomputes hashes against the on-disk content. **Mismatch on any hash → load is refused; the operator is shown a re-approval prompt naming the changed file(s).**

4. Content-hash binding applies regardless of trust tier — Tier 0 (self-built) included, because a self-built plug-in modified between sessions is also a re-approval event.

**Why this defense.** Cursor's CVE-2025-54136 (MCPoison) bound trust to the plug-in *name* not its *content*; one approval covered all future versions. Anthropic's claude-plugins-official marketplace already commit-pins (`source.url + ref + sha`) — content-hash binding is the operator-side analog. Cost: ~1 week. Coverage: closes the universal post-approval-mutation attack class.

### 3.3 Bash refuses package-install commands (closes N4)

The harness's Bash tool, as exposed to the LLM agent, **refuses execution** of any command whose argv (after shell-expansion) matches:

- `yarn add ...`, `yarn global add ...`, `yarn install <package>`
- `npm install <package>`, `npm i <package>`
- `pnpm add ...`, `pnpm install <package>`
- `jinn plug-ins add ...`, `jinn impls add ...`, `jinn harnesses add ...`
- Any `curl` / `wget` / `fetch` command resolving to `registry.npmjs.org/...`, `npm.pkg.github.com/...`, or other npm-compatible registries (host-allowlist match)
- Any direct invocation of an npm-compatible registry HTTP API

Refusal is logged to `workingDir/.bash/refused.jsonl` for operator visibility and surfaced via `status.fleet.needsAttention` if observed >0 times in a session.

**The harness is permitted** to:

- Read installed plug-ins' and harnesses' files
- Modify files within `workingDir/**` and `implStateDir/**`
- Execute non-install commands (compilation, test runs, file manipulation, etc.)
- Read the corpus and write debrief artifacts naming plug-ins it observed working

**Recommendations queue (§3.4)** is the structured output channel for plug-in suggestions the harness wants to pass to the operator.

**Why this defense.** Closes N4 directly; matches field standard (Claude Code, Cursor, Gemini CLI all require user confirmation for `npm install`-class commands; Gemini CLI's CVSS-10 was caused by a non-interactive mode bypassing this). Cost: ~2 days. Coverage: removes the autonomous-install attack vector entirely.

### 3.4 Recommendations queue

The harness's seven-phase pipeline can produce *recommendations* for plug-ins or harnesses it observed performing well in the corpus. Each phase that emits a recommendation writes a JSONL entry to `~/.jinn-client/recommendations.jsonl`:

```json
{
  "ts": "2026-05-05T12:34:56.000Z",
  "kind": "plug-in",
  "pkg": "@some-builder/calibration-refiner",
  "version": "1.2.3",
  "reason": "observed in 12 successful prediction.v0 attempts in the followed corpus over the last 7 days",
  "sourceCorpusEntries": ["envelope:bafy...", "envelope:bafy..."],
  "sessionId": "session-12345",
  "phase": "improve"
}
```

The operator reviews via `jinn plug-ins recommendations` (new verb), which prints:

```
3 recommendations from sessions in the last 24h:

  @some-builder/calibration-refiner@1.2.3 (plug-in)
    Reason: observed in 12 successful prediction.v0 attempts in the followed corpus
            over the last 7 days
    Source: 12 corpus envelopes (jinn plug-ins recommendations show <id> for full list)
    Suggested: jinn plug-ins add @some-builder/calibration-refiner

  @other-builder/news-context-topic@0.4.1 (plug-in)
    ...
```

The operator runs `jinn plug-ins add` (or doesn't). The recommendations file accumulates; nothing else happens automatically.

**Why this defense.** Preserves the learner's value (it can teach the operator about plug-ins that worked in the corpus) without the autonomy that creates N4. The structured output is also a useful audit log for operators reviewing what their daemon thought about. Cost: ~1 week. Coverage: replaces the autonomous-install autonomy with a non-coercive human-in-the-loop step.

### 3.5 Existing capability handles (Path 2 harnesses only)

Already shipped (per `2026-05-executor-trust-boundary.md` §3 and PR #63). Untouched by this spec. Reproduced here for completeness:

- `ScopedSigner` — EIP-712 typed-data domain allowlist; refuses unauthorized chain/contract/name/version
- `ScopedRpc` — JSON-RPC method allowlist
- `ScopedSecrets` — per-intent secret scoping
- Filesystem write restricted to `workingDir/**` + `implStateDir/**`

**Path 1 plug-ins do not get capability handles** — they inherit the harness's tools (Bash / Read / Write / Skill / Agent / MCP). This is the spec's main acknowledged gap; closing it is the deferred CaMeL-style work in §10.

---

## 4. Trust gradient (ERC-8004-aligned)

Four tiers, vocabulary aligned with ERC-8004's `supportedTrust` enum.

| Tier | ERC-8004 mapping | Trust roots | Capability surface | Operational v0? | Path 1 (plug-ins)? | Path 2 (harnesses)? |
|---|---|---|---|---|---|---|
| **0 — Self-built** | n/a (local-only) | r9 implicit (operator wrote it) | Full | ✓ | ✓ | ✓ |
| **1 — Signed-by-trusted** | `reputation` (operator-pinned attestors) | r1 (operator-pinned signer) + r7 (Sigstore evidence on signed manifest) | Full | ✓ | ✓ | ✓ |
| **2 — Community-reviewed** | `reputation` (operator-followed attestor set) | r1 + r4 (ERC-8004 reputation registry) — *enforcement deferred* | Narrowed (no signer write, RPC read-only, no new MCP slots) | ✗ (schema enum reserved) | ✗ | (✓ when enforced) |
| **3 — Sandboxed-only** | `crypto-economic` ∨ `tee-attestation` (ValidationRegistry) | r9 (sandbox contains damage) | Minimal (compute + payload emit; no network/FS/signer/RPC) | ✗ (schema enum reserved) | ✗ | (✓ when enforced) |

### 4.1 Why ERC-8004 alignment

ERC-8004 went live on Ethereum mainnet 2026-01-29 with three registries (Identity, Reputation, Validation) and a `supportedTrust: [reputation | crypto-economic | tee-attestation]` enum that *is* a trust gradient with different vocabulary. Jinn already uses the IdentityRegistry. Aligning vocabulary now means future tier enforcement (Phase B.2 + out-of-process executor) extends the existing on-chain primitives instead of creating parallel infrastructure.

### 4.2 Trust roots (operational v0 vs deferred)

| Root | Description | v0 status |
|---|---|---|
| **r1** | Operator-pinned signer pubkey set in config | Operational |
| **r4** | ERC-8004 attestation chain from operator-followed attestors | Schema lives; enforcement deferred to Phase B.2 |
| **r6** | Builder bond posted; slashed on dispute | Deferred to Phase B.2 |
| **r7** | Sigstore / OIDC provenance on the manifest | Operational (evidence field on Tier 1 manifests) |
| **r8** | Named-reviewer attestation set with reviewer reputation | Schema lives; reviewer-reputation deferred to Phase B.2 |
| **r9** | None / sandbox-contains-damage | Operational at OS-level (operator runs daemon in VM/container per disclaimer §3.1); not enforced at plug-in level until out-of-process executor lands |

### 4.3 v0 deferred-tier behavior

A plug-in or harness manifest that *declares* `tier: 2` or `tier: 3` is **loaded as Tier 1** for v0 enforcement (subject to all Tier 1 trust roots being satisfied). The declared tier is recorded in the installed-plug-ins record for future consumption when enforcement lands; it does not change loader behavior in v0. Operators see the declared tier in `jinn plug-ins list` output with a `(declared, not enforced)` annotation. This keeps the schema seam clean while honestly representing what the protocol does today.

---

## 5. Discovery surface

Three layers, ranked by cost and authority.

### 5.1 D1 — Local operator config (already exists)

`~/.jinn-client/config.json` lists the operator's installed plug-ins, harnesses, and trusted signers. No change. This is the default discovery surface — operators install what they explicitly choose, period.

### 5.2 D2 — Publish-on-install attestation

When an operator runs `jinn plug-ins add @foo/bar --publish` (or `jinn harnesses add` with the same flag), the daemon writes an ERC-8004 attestation under the operator's existing agent identity (per the ERC-8004 entity-model design). The transaction is sent **best-effort from the operator's master EOA** (already funded with ETH for OLAS staking transactions per the earning bootstrap). On insufficient funds, RPC error, or other failure, the local install still succeeds; the daemon logs a warning that the attestation did not publish, and the install record reflects `publishedAttestation: null`. The operator can re-attempt via `jinn plug-ins endorse @foo/bar` later.

```jsonc
{
  "schemaUid": "<plug-in-attestation-schema-uid>",
  "kind": "installed",
  "subject": "@foo/bar",
  "subjectType": "plug-in",
  "version": "1.2.3",
  "manifestHash": "sha256:...",
  "tarballHash": "sha256:...",
  "tier": 1,
  "attestedAt": "2026-05-05T12:00:00Z"
}
```

`--publish` is **opt-in** — operators who don't want to advertise installs simply don't pass the flag. The default is *not* to publish. Operators can set `publishInstallAttestations: true` in config to flip the default for future installs.

**Why an attestation, not a registry write.** Anyone can write to ERC-8004; the value is *who* wrote it. The discovery model is "follow operators you trust; consume their attestations" — sybil resistance comes from the operator's choice of attestor set, not from an authoritative central registry. This matches Jinn's headless-brand posture (`BRAND.md`): no central authority decides what is real.

### 5.3 D3 — `discover` command

```
jinn plug-ins discover [--kind=<plug-in-kind>] [--limit=<n>]
jinn harnesses discover [--supports=<intent-kind>] [--limit=<n>]
```

Reads the operator's `followedAttestors[]` config (operator's choice of who they trust to read attestations from), queries ERC-8004 for `installed` / `endorse` / `review` attestations from those attestors, returns a list ranked by:

1. Number of `endorse` attestations from followed attestors (descending)
2. Number of `installed` attestations from followed attestors (descending)
3. Number of `review` attestations (descending)
4. Recency of most recent attestation (descending)

Negative attestations (`warn` / `block`) from followed attestors are **subtracted** from the ranking and shown with a flag in the output.

Output shape:

```
@some-builder/calibration-refiner@1.2.3 (plug-in)
  Endorsements: 7 from followed attestors
  Installed by: 12 followed attestors
  Reviews: 2 (jinn plug-ins reviews show @some-builder/calibration-refiner)
  Tier: 1 (signed-by-trusted; signer 0xabc... pinned by 5 followed attestors)
  Add: jinn plug-ins add @some-builder/calibration-refiner

@questionable-builder/typosquat@0.0.1 (plug-in)
  ⚠ 3 warnings, 1 block from followed attestors
  Add: jinn plug-ins add @questionable-builder/typosquat (not recommended)
```

**No marketplace, no curation, no review pipeline.** Discovery is "show me what operators I trust have done with this; let me look at the source myself."

### 5.4 What the spec explicitly does not ship

- A web-facing marketplace (e.g., `marketplace.jinn.network`)
- Categories, search facets, or featured listings
- Anonymous popularity counts (only attestations from followed attestors are rendered)
- Auto-discovery (operators must explicitly populate `followedAttestors[]`)
- Curated allowlist or staff-reviewed badge
- Forced auto-update (operators apply updates manually via `jinn plug-ins update <pkg>` per `2026-04-30-plug-in-surface.md` §4.4.4)

---

## 6. Feedback surface

The new piece. One ERC-8004 attestation schema, four operator verbs (per kind), shared between plug-ins and harnesses.

### 6.1 Attestation example

A concrete `endorse` attestation, with all schema fields flat per §8.1:

```jsonc
{
  "schemaUid": "<plug-in-attestation-schema-uid>",
  "subject": "@foo/bar",
  "subjectType": "plug-in",
  "version": "1.2.3",
  "manifestHash": "sha256:...",
  "tarballHash": "sha256:...",
  "tier": 1,
  "kind": "endorse",
  "score": 1,
  "reason": "ran 14 prediction.v0 attempts; consistent +0.04 Brier improvement vs baseline",
  "reviewCid": "",
  "attestedAt": "2026-05-05T12:00:00Z"
}
```

Schema rules per `kind`:

- `kind=installed` — `score=0`; `reason` empty; `reviewCid` empty; emitted only by the install path with `--publish`
- `kind=endorse` — `score=+1`; `reason` optional; `reviewCid` empty
- `kind=warn` — `score=-1`; `reason` required; `reviewCid` empty
- `kind=block` — `score=-2`; `reason` required; `reviewCid` empty
- `kind=review` — `score=0` (informational); `reason` optional summary; `reviewCid` required

`subjectType` distinguishes plug-ins (Path 1) from harnesses (Path 2) so consumers can filter.

The schema is registered in ERC-8004's SchemaRegistry once at deploy time; the schema UID is published in a Jinn-canonical config file consumed by the daemon and the CLI.

### 6.2 CLI verbs

| Verb | Effect |
|---|---|
| `jinn plug-ins endorse @foo/bar` | Publish `endorse` attestation (`+1`). Optional `--reason "..."` |
| `jinn plug-ins warn @foo/bar --reason "..."` | Publish `warn` attestation (`-1`). Reason required |
| `jinn plug-ins block @foo/bar --reason "..."` | Publish `block` attestation (`-2`). Reason required. Implies local disable |
| `jinn plug-ins review @foo/bar --notes-file <path>` | Pin notes file to IPFS, publish `review` attestation referencing the CID |
| `jinn plug-ins feedback list @foo/bar [--from=<attestor>]` | Read attestations from followed attestors, group by kind, print |

Same five verbs available for `jinn harnesses *`.

### 6.3 The `review` verb

The critical UX move for community feedback at quality.

The notes file is a markdown document the operator writes ad-hoc. Conventions (recommended in `client/docs/security.md`, not enforced by the schema):

- One-line summary at the top
- "What I checked" — what the operator actually reviewed (source files, tests run, threat surfaces examined)
- "What I found" — observed behavior, suspicious patterns, or "looks clean"
- "Verdict" — `endorse` / `warn` / `block` / `informational`
- The operator's signing identity (the ERC-8004 attestor address)

The daemon pins the file to IPFS via the existing IPFS client (`client/src/adapters/mech/ipfs.ts`) and stores the resulting CID in the attestation's `reviewCid` field. Readers fetch the CID via the existing IPFS gateway.

**Why IPFS for review notes** (vs operator's HTTP server per Phase A.1's `access.endpoint`):

- Reviews are public discovery anchors (same posture as manifests, which Phase A.1 keeps on IPFS)
- Reviews must remain readable even if the reviewer's daemon goes offline
- Reviews are never paywalled (no `priceUsdc` field; they are not artifact content)

If a reviewer wants to retract, they publish a new attestation with `kind=warn` (or `kind=block`) and a reason mentioning the retraction; the historical review attestation remains on-chain (ERC-8004 reputation registry semantics).

**Normative — most-recent-attestation-wins.** The daemon's read path resolves the *current verdict* per `(attestor, subject, version)` tuple by selecting the attestation with the largest `attestedAt` timestamp from each attestor. Older attestations from the same attestor for the same subject+version are surfaced only when an operator explicitly requests history (`jinn plug-ins feedback list --include-history`). This applies uniformly to `endorse` / `warn` / `block` / `review` kinds — a later `block` overrides an earlier `endorse`, and vice versa.

### 6.4 Best-effort publish semantics

All five publish verbs (`endorse` / `warn` / `block` / `review`, plus the `installed` attestation emitted by `add --publish`) follow the **best-effort on-chain** pattern from §5.2: the transaction is sent from the operator's master EOA; on failure (insufficient funds, RPC error, etc.), the local action still completes (e.g., `block` still locally disables; `review` still pins notes to IPFS) and the daemon logs a warning. Operators can retry via the same verb later. This keeps the local-state and on-chain-state surfaces independent.

### 6.5 Aggregation and presentation

The `feedback list` verb groups attestations by kind and prints. The `discover` and `status` verbs (§5.3, §7.3) consume the same attestations as ranking inputs.

**No client-side scoring magic** — operators see the raw counts and can read individual reviews. Any scoring algorithm is the operator's choice, not Jinn-canonical.

---

## 7. Revocation surface

Three operations, all cheap.

### 7.1 R1 — Operator-side disable

Already exists per `2026-04-30-plug-in-surface.md` §4.3 (`learnerPlugIns.disabled[]`) and `2026-05-registry-discovery.md` §4.1 (`restorers.disabled[]`). Extend trivially:

- `jinn plug-ins disable @foo/bar` — adds to `learnerPlugIns.disabled[]`; learner skips at session start
- `jinn harnesses disable @foo/bar` — adds to harness `disabled[]`
- `jinn harnesses untrust <signerPubkey>` (renamed from `jinn impls untrust` per harness-pack vocabulary) — extends to the harness path

`jinn plug-ins block` and `jinn harnesses block` (per §6.2) **imply** the corresponding `disable` action locally as a single atomic operation.

### 7.2 R2 — Negative attestation as advisory

The `warn` and `block` feedback kinds (§6.2) **are** the revocation primitive. They have no protocol-level enforcement in v0 — they are advisories consumed at operator discretion.

This is the AMO Restrict (warn) / Block (block) two-tier model from prior-art research, recast for the followed-attestor model: an attestor's `block` is binding *for that attestor's local install*, advisory *for any other operator following that attestor*.

### 7.3 R3 — `status` command

```
jinn plug-ins status [--installed-only] [--show-warnings]
jinn harnesses status [--installed-only] [--show-warnings]
```

For each installed plug-in (or harness):

- Resolves the current installed `manifestHash`
- Queries ERC-8004 for attestations referencing that hash from the operator's followed-attestor set
- Surfaces any `warn` / `block` attestations
- Surfaces any `endorse` count
- Recommends action (review / disable) when warnings/blocks are present

Output shape:

```
@some-builder/calibration-refiner@1.2.3 (plug-in, Tier 1)
  ✓ 7 endorsements from followed attestors
  No warnings or blocks

@questionable-builder/typosquat@0.0.1 (plug-in, Tier 0)
  ⚠ 3 warnings from followed attestors:
    - 0xabc... (2026-05-04): "exfiltrates ~/.jinn-client/keystore on first run"
    - 0xdef... (2026-05-04): "confirms exfil; do not install"
  ⛔ 1 block from followed attestor:
    - 0xghi... (2026-05-05): "verified malware"
  Suggested: jinn plug-ins disable @questionable-builder/typosquat
```

The operator decides whether to act. **No auto-disable** in v0 (would create a centralization risk: a single attacker compromising a popular attestor could disable plug-ins across many operators).

---

## 8. ERC-8004 schemas — concrete shapes

Two schemas registered in ERC-8004's SchemaRegistry at the chosen Jinn deployment chain.

### 8.1 Plug-in / harness installation + feedback attestation

```
schema PlugInAttestation {
  string subject;            // npm package name, e.g. "@foo/bar"
  string subjectType;        // "plug-in" | "harness"
  string version;            // semver, e.g. "1.2.3"
  bytes32 manifestHash;      // sha256 of canonical-JSON manifest
  bytes32 tarballHash;       // sha256 of resolved package tarball
  uint8 tier;                // 0 | 1 | 2 | 3 (declared)
  string kind;               // "installed" | "endorse" | "warn" | "block" | "review"
  int8 score;                // -2 | -1 | 0 | +1; 0 for "installed" / "review"
  string reason;             // optional text; required for warn/block
  string reviewCid;          // IPFS CID; required for "review"; empty otherwise
  uint64 attestedAt;         // unix seconds
}
```

Fields are flat (EAS / ERC-8004 SchemaRegistry style — no nested objects). This single schema serves all five `kind` values, both plug-ins and harnesses.

Field-by-`kind` requirements are summarized in §6.1.

### 8.2 Followed-attestor declaration (informational)

Operators who want to publicly declare their followed-attestor set can publish:

```
schema FollowedAttestorList {
  address[] attestors;
  uint64 declaredAt;
  string note;               // optional
}
```

This is informational (sybil-resistant by construction — anyone can claim anyone follows them, but the value is whether *the operator's own daemon* consumes attestations from those addresses, which is local config). Useful for cluster-mapping and warm-introduction discovery, not for trust derivation.

The followed-attestor schema is **optional** — operators do not need to publish it for the discovery / feedback / revocation surfaces to work; their daemon's local `followedAttestors[]` config is what drives behavior.

---

## 9. CLI verbs — additions and changes

### 9.1 New verbs

| Verb | Purpose | Section |
|---|---|---|
| `jinn plug-ins discover` | Discovery; reads followed-attestor attestations | §5.3 |
| `jinn plug-ins recommendations` | Show learner-emitted plug-in recommendations | §3.4 |
| `jinn plug-ins endorse` | Publish endorse attestation | §6.2 |
| `jinn plug-ins warn` | Publish warn attestation | §6.2 |
| `jinn plug-ins block` | Publish block attestation; implies local disable | §6.2 |
| `jinn plug-ins review` | Pin review notes to IPFS, publish review attestation | §6.2 |
| `jinn plug-ins feedback list` | Read feedback attestations | §6.2 |
| `jinn plug-ins status` | Cross-check installed plug-ins against followed-attestor warnings/blocks | §7.3 |
| `jinn harnesses discover / recommendations / endorse / warn / block / review / feedback list / status` | Same shape for harnesses | §§5.3, 6.2, 7.3 |

### 9.2 Behavioral changes to existing verbs

| Verb | Change | Section |
|---|---|---|
| `jinn plug-ins add` | Computes content hash, stores in installed-plug-ins record; enforces hash check at session start | §3.2 |
| `jinn plug-ins add --publish` | Optionally publishes `installed` attestation | §5.2 |
| `jinn harnesses add` | Same content-hash + publish semantics | §3.2, §5.2 |
| `jinn impls untrust` | Aliased / renamed to `jinn harnesses untrust` per harness-pack architecture vocabulary | §7.1 |
| `jinn run` first-run output | Prints abridged disclaimer | §3.1 |
| Bash tool exposed to harness | Refuses package-install commands | §3.3 |

### 9.3 New config fields

In `~/.jinn-client/config.json` (defaults shown):

```jsonc
{
  // ...existing...
  "followedAttestors": [],         // empty by default; operator populates over time (§13.1)
  "publishInstallAttestations": false,
  "recommendationsDedupeWindowDays": 7
}
```

In `~/.jinn-client/installed-plug-ins.json` (new file; sibling to existing config):

```jsonc
{
  "@foo/bar": {
    "version": "1.2.3",
    "manifestHash": "sha256:...",
    "tarballHash": "sha256:...",
    "entryPointHashes": { "agents/x.md": "sha256:..." },
    "tier": 1,
    "installedAt": "2026-05-05T12:00:00Z",
    "publishedAttestation": "0x..."
  }
}
```

Same shape for `~/.jinn-client/installed-harnesses.json`.

---

## 10. Deferred — and the trigger condition for each

This spec ships seams, not enforcement, for several primitives the survey identified as eventually-needed. Each is named here with the trigger condition that escalates it from a deferred seam to a v1 defense.

| Primitive | Status | Trigger to ship |
|---|---|---|
| **CaMeL dual-context for Path 1 plug-in outputs** | Architectural seam (the harness can route plug-in outputs through a quarantined sub-agent without redesigning manifest schemas) | First observed prompt-injection-via-plug-in incident, OR a published exploit demo against `claude-code-learner`'s Path 1 surface |
| **Registration-time manifest linter** (Glama-style scoring + Invariant tool-poisoning patterns) | None yet; would integrate at `add` verb | Observed manifest-text-injection attack in the wild against any Jinn operator |
| **Builder bond / slashing** (r6) | Trust-root reserved in §4 vocabulary; no contract | Phase B.2 evaluator-economics ships; bond becomes a generalization of evaluator stake |
| **Named-reviewer reputation set with stake** (r8) | Trust-root reserved; ERC-8004 reputation registry handles attestation surface | Phase B.2 ships reviewer-stake design; `review` attestations from §6 graduate to weighted-by-stake |
| **Tier→reward-eligibility coupling** (the N2 fix) | Tier-2/3 declared-but-not-enforced shape (§4.3) | Observed N2-shaped operator harm; ships as scoped `RestorationActivityChecker.sol` change so low-tier plug-ins' deliveries do not count toward staking-reward eligibility |
| **Tier 3 sandbox enforcement** | Schema enum reserved | Out-of-process harness executor lands (Phase 2+) |
| **Forced takedown / on-chain enforced revocation** | None; explicitly out of scope | Hostile-builder incident at scale where advisory-only revocation proves insufficient; would require governance design |

**Why this list is honest.** Every primitive named above is something the survey identified as a real defense or feature that exists somewhere in the LLM-agent / Web3 ecosystems. We chose not to ship them because (a) the field standard ships less, (b) the engineering cost is multi-week-to-multi-month, (c) several depend on Phase B.2 evaluator-economics that hasn't shipped yet, and (d) shipping a defense before incidents have shown which one is most-needed risks building the wrong defense. Each row above is a *named* future move with a *concrete* trigger.

---

## 11. Disclaimer text — canonical

Reproduced verbatim for reference and machine-extraction. The full text:

```
The Jinn daemon runs an autonomous learning agent that reads the network's
corpus, adapts its own strategy, and executes code from any third-party
plug-ins or harnesses you have installed. Run the daemon in an isolated
environment. Recommended: a fresh VM, a Docker / devcontainer with no
host volumes mounted beyond the daemon's working directory, or a dedicated
user account on a machine you do not use for anything else. Do not run
the daemon alongside personal credentials, signing keys, or production
wallets.

Third-party plug-ins and harnesses are not reviewed or audited by Jinn.
By installing one, you accept that its code will run with the daemon's
full capabilities (including network egress, filesystem access within
the daemon's user, and any wallet keys held in the daemon's keystore).
You are responsible for evaluating each plug-in or harness's source.

The daemon will not autonomously install plug-ins or harnesses. The
learning agent may recommend ones it observed in the corpus;
recommendations are written to ~/.jinn-client/recommendations.jsonl
for your review. Installing a recommendation is your explicit step
(jinn plug-ins add <name> or jinn harnesses add <name>), at which
point a content-hash is bound and any future change to the package's
content forces re-approval.
```

The abridged one-line version printed on every successful install:

```
Reminder: Jinn does not audit third-party code. You are responsible
for evaluating each plug-in's source. Run the daemon in an isolated
environment.
```

---

## 12. Acceptance criteria

This spec is accepted when:

1. The spec is merged under `spec/`.
2. `spec/2026-04-30-plug-in-surface.md` receives a forward-pointer in §8 (open questions) noting that the network-trust questions are resolved here.
3. `spec/2026-05-executor-trust-boundary.md` receives a forward-pointer in §5.6 (revocation) noting that the network-visible registration surface is defined here.
4. The Bash installer-refuse rule (§3.3) ships as a discrete bead with a passing test that asserts each forbidden command form is refused and logged.
5. The content-hash binding (§3.2) ships as a discrete bead with a passing test that asserts mutation forces re-approval and that the content-hash record is correctly written for both Path 1 and Path 2 installs.
6. The recommendations queue (§3.4) ships as a discrete bead with a passing integration test driving the learner against a synthetic corpus and asserting recommendations appear in `~/.jinn-client/recommendations.jsonl`.
7. The ERC-8004 PlugInAttestation schema (§8.1) is registered on the chosen Jinn deployment chain; the schema UID is published in a Jinn-canonical config consumed by the daemon and CLI.
8. The new and changed CLI verbs (§9) ship with help text and are documented in `client/docs/security.md` (new) and the existing `client/docs/path-1/` and `client/docs/path-2/` doc trees.
9. The disclaimer (§11) ships in the daemon's first-run output, both quickstart docs, and the new `client/docs/security.md`.
10. `client/docs/security.md` ships guidance for first-run operators on populating `followedAttestors[]`. The default config ships with an empty list (per §13 open question 1); the docs explain how operators identify and add attestor addresses (word-of-mouth, observed cluster activity, GitHub Discussions threads, etc.).

---

## 13. Open questions

1. **`followedAttestors` bootstrap.** First-run operators have no followed-attestor set, and the Jinn DAO is on-chain with a Governor + Timelock (no multisig that could publish a starter list). **v0 ships an empty `followedAttestors[]` by default.** Operators populate the list themselves as they identify operators whose attestations they trust (word-of-mouth, observed cluster activity, GitHub Discussions threads, in-person introductions). The first-run UX is honest: discovery returns no results until the operator chooses someone to follow. A future follow-up may add a published starter list once a coordination body for that purpose exists; v0 does not pre-empt the design.

2. **Cost of ERC-8004 attestation publishes.** Each `endorse` / `warn` / `block` / `review` is an on-chain transaction. **v0 ships best-effort on-chain attestations using the operator's existing master EOA** (already funded with ETH for OLAS staking transactions per the earning bootstrap). The daemon attempts the publish; on insufficient funds, RPC error, or other failure, the daemon logs a warning, the local install/feedback action still succeeds, and the operator is told the attestation did not publish. **No batched-attestation, hybrid-mode, or off-chain-anchor work in v0.** If publish costs become a real operator-cost concern at scale, that is a follow-up bead at that time.

3. **Review-CID retention.** Review notes are pinned to IPFS via the daemon's existing IPFS client. Phase A.1's "operator-rooted retention" model says IPFS pinning is fragile; if the reviewer's pinning service drops the CID, the review becomes unreadable. Tentative: the attestation includes the IPFS CID and reviewers are responsible for pinning; Phase D shared caches will harden this.

4. **`subjectType` versioning.** If a future spec adds a third subject type beyond `plug-in` / `harness` (e.g., a knowledge module or evaluator-only kind), how is the schema extended? Tentative: the schema is additive — new `subjectType` values can be introduced without breaking the schema; consumers ignore unknown types.

5. **CLI verb collision with existing `jinn plugin install` (singular).** Per `2026-04-30-plug-in-surface.md` §8.1, the existing `jinn plugin install` (singular, for installing the Jinn MCP server into AI hosts) and the new `jinn plug-ins ...` (plural, for plug-ins inside the daemon) are explicitly distinct. The new feedback verbs (`endorse` / `warn` / `block` / `review` / etc.) make the collision more pronounced. **Resolution deferred to the implementation plan** — the rename / disambiguation choice is a CLI follow-up, not a substrate change, and is best decided when the verb-set is being implemented.

6. **Privacy of `installed` attestations.** Publishing `installed` attestations reveals which plug-ins an operator runs, which leaks competitive intel. The `--publish` opt-in is the user-facing control. Tentative: `client/docs/security.md` ships guidance — *publish for plug-ins you want to advertise discovery for; don't publish for plug-ins that constitute your competitive edge.* No further protocol mechanism required.

7. **Recommendations queue write rate.** The seven-phase pipeline could in principle emit a recommendation every session. If recommendations.jsonl grows fast, the operator's review burden grows with it. Tentative: the learner deduplicates recommendations by `(pkg, version)` within a 7-day rolling window and only writes a new entry when the source-corpus-entries set has changed materially. Tunable via config field `recommendationsDedupeWindowDays`.

---

## 14. Cross-cutting integration with sibling specs

Net-zero correctness changes are required to any sibling spec; the additions below are recommended as follow-up beads.

### 14.1 `spec/2026-04-30-plug-in-surface.md`

- Forward-pointer in §8 (open questions) noting that questions about discovery, registration, feedback, and revocation are resolved here.
- The §4.4 install path text is extended (not redesigned) by §3.2 of this spec.

### 14.2 `spec/2026-05-executor-trust-boundary.md`

- Forward-pointer in §5.6 (revocation) noting that the network-visible registration surface (this spec's §5–§7) is the consumer of the per-impl revocation primitive defined there.
- The trust-boundary spec's signer-untrust mechanism is the substrate this spec's `jinn harnesses untrust` verb (§7.1) calls.

### 14.3 `spec/2026-05-01-harness-pack-architecture.md`

- This spec uses the harness-pack vocabulary throughout (`harness` not `RestorerImpl`).
- The `jinn impls *` → `jinn harnesses *` rename (§9.2) is the CLI surface of the harness-pack vocabulary.

### 14.4 `docs/superpowers/specs/2026-04-27-erc-8004-entity-model-design.md`

- This spec extends the operator-rooted ERC-8004 entity model with two new attestation schemas (§8). The schemas live in the same SchemaRegistry as the entity-model schemas; the operator's agent identity is the attestor identity for all attestations published by this spec.

### 14.5 `spec/2026-04-30-phase-a-umbrella.md`

- This spec is a sibling to the plug-in-surface spec under the Phase A.2 workstream. It does not change any Phase A.1 deliverable. The `recommendations.jsonl` queue (§3.4) reads from the Phase A.1 corpus library.

---

*End of v0.1.*
