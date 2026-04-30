# Jinn as the knowledge market — protocol, infrastructure, apps, and the work to get there

**Status:** Discussion draft
**Date:** 2026-04-30
**Author:** ritsukai (sitting with Opus)
**Lineage:** Sharpens [discussion #41 — Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41) by collapsing the framing into a single end-state, naming the three layers it splits into, and mapping current code to the phases ahead.

This is a discussion draft, not a commitment. It exists to give the team a single picture of where Jinn is going, what stands between us and that end-state, and which workstreams matter. Push back where the framing is off.

---

## TL;DR

**Jinn is the knowledge market for verified agentic execution knowledge.** Operators run intents and produce trajectories. Trajectories are priced, verified, and accessible to anyone who pays — humans, labs, vertical AI companies, end users, agents fulfilling other agents' work. There is one buy primitive and anyone can use it.

The compounding mechanism falls out automatically: because agents are buyers like everyone else, fulfilling a complex intent naturally pulls past trajectories from the corpus, paying their original creators. A's failure becomes B's lesson, B's success becomes C's input, the corpus compounds — *because the agents in it are also consumers of it*. Closed labs cannot replicate this because they cannot open the loop to operators they don't employ, against a corpus their competitors also contributed to.

The system splits into three layers. **The protocol** — on-chain contracts, envelope schemas, signing rules, tokenomics. The neutral substrate that makes execution knowledge tradeable. **Infrastructure** — subgraph indexers, storage backends, x402 facilitators, retrieval APIs. The operational stack that makes the protocol usable. **Apps** — user-facing surfaces. The first product on top of Jinn.

The protocol is mostly built. Infrastructure is partial — there's a gating leak that defeats pricing today. Apps are mostly missing. The phases below close those gaps in dependency order.

---

## 1. The compounding loop

Closed labs compound knowledge by default. Every run feeds back into the next: traces, failures, evaluations, operational lessons stay inside the institution. Open networks have the opposite problem. They coordinate work from a wider surface area but most of what they buy is an output, not the knowledge that produced it. The knowledge either stays private (and the network cannot learn) or becomes public for free (and the best operators stop investing).

Discussion #41 named this tension and proposed: turn execution knowledge itself into a priced asset. This document accepts that frame and tightens it.

**One market, one buy primitive, anyone can use it.** A trader, a developer, a fund, an open-weights lab, a regulated enterprise, a researcher, an end user, an agent fulfilling somebody else's intent — they all use the same primitive. Pay, get knowledge. Same envelopes, same gating, same x402 rails, same evaluator scores, same reputation. The protocol makes no distinction between buyer types. *Anyone who wants knowledge from the network is a buyer.*

The compounding loop is not a separate mechanism. It is what happens automatically when agents — which are buyers like anyone else — read past trajectories during their own work. An agent producing a portfolio strategy queries past portfolio trajectories. An agent producing a prediction queries past evaluator notes. An agent debugging a contract queries past debugging trajectories. The corpus compounds because its participants consume it.

Labs that buy from Jinn are doing the same thing at a different cadence: they pull bulk corpus, train on it, deploy improved models, re-enter the network as solvers running those improved models. They metabolise Jinn rather than extracting from it (Oak's framing in #41). The lab does not become an exclusive consumer of any particular operator's edge — they buy knowledge that operators chose to disclose at a price, and contribute new knowledge back when they re-enter.

The structural advantage compounds two ways. **Volume** — more buyers buying means more operators producing means more knowledge accumulating. **Provenance** — every envelope carries cryptographic lineage, evaluator scores, operator reputation; this metadata layer is the moat, and it is built by the protocol's own activity.

---

## 2. The thesis in one line

> **Jinn is the open, verifiable market for agentic execution knowledge — where operators produce trajectories, anyone can buy them, and the network compounds intelligence faster than any single lab.**

Three things to notice about that framing.

**"Knowledge," not "outputs."** A prediction, a swap, a scored answer is an output. The trajectory that produced it — context, plan, prompts, tool calls, sources, intermediate observations, failed branches, evaluator notes, outcome proof — is the knowledge. Pricing knowledge dominates pricing outputs because the output is consumed once and the knowledge is reusable forever.

**"Anyone."** No buyer classes. No "labs vs end users vs agents." Anyone with a wallet who wants knowledge issues a request and pays. The market does not care who they are or why. This is the property that makes the agent-to-agent compounding loop fall out for free.

**"Compounds intelligence."** Most data marketplaces clear transactions. Jinn's distinctive property is that the act of selling knowledge *makes the next round of knowledge production better*, because the next operator runs against a richer corpus. Volume × provenance × open-loop = compounding curve.

---

## 3. The three layers

Jinn splits cleanly into three layers. Each has a different role, a different audience, and a different rate of change.

### 3.1 Protocol — the substrate

The protocol is what makes execution knowledge tradeable. It is the set of rules and on-chain primitives that the network agrees on. It is neutral, slow-changing, governance-controlled. It is what cannot be forked away from because participants have anchored real economic activity into it.

What's at the protocol layer:

- **Solution-request specification.** The schema for an intent: kind, predicate, window, eligibility, escrow. *Anyone with a wallet can post one* — open access is what makes the decentralisation claim real. Today: `JinnRouter`.
- **Operator economics.** Registration, staking, reputation, payout. Today: ERC-8004 IdentityRegistry + ClaimRegistry + ReputationRegistry, plus tokenomics.
- **Execution envelope schema.** The trajectory format — components, signatures, tier (self-signed → committed → consensus → attested → proved), public/private boundary, content-addressing rules. Today: `client/src/types/envelope.ts` + the envelope spec at `docs/superpowers/specs/2026-04-23-jinn-execution-envelope-tee-scope.md`.
- **Evaluation rules.** What it means for an evaluator to score, the multi-evaluator consensus mechanic, the challenge mechanism. Today: ValidationRegistry on-chain, evaluator restorer impls per kind.
- **Settlement primitives.** x402 payment, claim primitives, royalty mechanics. Today: x402 facilitator + claim adapters; royalty splits not yet defined.
- **Storage rules.** The contract between content addressing and access control: gated content carries an access pointer, not bytes; ungated content can be public-addressable. Today: schema present in packaging; *enforcement leaks* (see §4).

The protocol does **not** include a query language for the corpus, an indexer, a storage backend, or a UI. Those are infrastructure or apps.

The protocol is mostly built. The remaining protocol work is pricing/royalty primitives (Phase B) and any schema additions needed to support them.

### 3.2 Infrastructure — the operational stack

Infrastructure is what runs alongside the protocol to make it usable. It is replaceable, plural, and not load-bearing for decentralisation — anyone can run their own. Infrastructure is what indexes the protocol's state, stores envelope content, mediates payments, and exposes APIs that apps consume.

What's at the infrastructure layer:

- **Indexers.** The subgraph is the canonical Jinn indexer today, but the protocol does not depend on it. Anyone can run their own indexer over the same on-chain events. Multiple parallel indexers are healthy — they are the structural answer to "single point of trust for discovery."
- **Storage backends.** Operator nodes serving x402-gated content. IPFS (or Filecoin/Arweave) for non-gated content where public availability is desired. Replaceable.
- **x402 facilitators.** Settlement rails between buyer payment and content delivery. Today: in `client/src/x402/`.
- **Retrieval APIs.** Wrappers over indexer + x402 acquire that apps use. Today: a skeleton in MCP tools (`publish_artifact`, `search_artifacts`, `acquire_artifact`) operating against a local store; not yet a network-wide retrieval API.

Infrastructure is the layer where the **gating leak** lives. The leak is operational — content gets uploaded to public IPFS even when tagged `x402-gated`, defeating the gate. Fixing it doesn't require a protocol change; it requires an infrastructure change to the publish path.

### 3.3 Apps — the products on top

Apps are user-facing surfaces. They translate human (or agent) intent into protocol-level operations. The first app on top of Jinn is the **knowledge marketplace** — the user-facing product where buyers come to acquire execution knowledge. There can be many apps on the same protocol; the first ones are how Jinn becomes legible to people who don't read the schema.

What apps do, that the protocol and infrastructure do not:

- **Translate user requests into protocol intents** (the production path: post a request, escrow funds, wait for an operator to claim and produce).
- **Translate user queries into corpus retrieval** (the retrieval path: search the indexer, return matching trajectories, x402 acquire the content).
- **Apply selection rules** at query time (rank by reputation? evaluator consensus? user-defined predicate?).
- **Bundle royalties** (a knowledge-query that returns a 5-trajectory bundle splits payment across the original creators).
- **Own UX** — request creation form, search UI, agent SDK, lab-tier API, ve-JINN governance UI.

**Apps may unify request and query into one surface, or split them into two — this is a product choice, not a protocol decision.** The protocol underneath has two distinct mechanisms: posting an intent (which commissions new work and produces a fresh trajectory) and reading the corpus (which retrieves existing trajectories). They have different freshness, different latency, different price profiles:

| | Request (production path) | Query (retrieval path) |
|---|---|---|
| **Output** | Fresh trajectory, commissioned for this specific predicate | Matching trajectories from the historical corpus |
| **Latency** | Deferred — operator must run | Immediate — corpus already populated |
| **Pricing** | Bounty + future-royalty residual | Retrieval fee + royalty to past creators |
| **Specificity** | Targeted to the buyer's exact predicate | Best-effort over what exists |
| **Risk** | Operator may not claim or may produce poor work | Trajectory exists but may not match perfectly |

Apps decide whether to expose them as one ("ask Jinn for knowledge — we'll route") or two ("commission new" and "search corpus" as separate products). Both are valid. Different apps may make different choices. The market sorts.

---

## 4. Where the code actually is

Honest take, layer by layer. References point at real paths so the gaps are concrete.

### 4.1 Protocol — solid, with one near-term schema gap

`JinnRouter` request creation + delivery is live. `IdentityRegistry`, `ValidationRegistry`, `ReputationRegistry`, `ClaimRegistry` are deployed. Envelope schema is well-defined (`client/src/types/envelope.ts`, the envelope spec). Evaluator restorer impls exist per kind (`client/src/restorer/impls/{portfolio,prediction,prediction-apy}-v0-evaluator/`). Multi-evaluator consensus is single-evaluator today; that's a known Tier 2 upgrade rather than a structural gap.

The near-term protocol gap is **royalty-split primitives**: when a knowledge-query buys an old envelope, who gets paid (original operator, evaluator, components creators) and in what shares is unspecified. This is a Phase B design surface.

### 4.2 Infrastructure — the gating leak is here

This is where the load-bearing operational gap sits.

**Subgraph (canonical indexer):** Indexes Executions with `manifestCid`, `payloadVersion`, `tier`, `kind`, plus the full operator/validation/feedback graph (`subgraph/schema.graphql`). The discoverable surface is healthy. *Operationally* this is the canonical indexer, not the protocol.

**x402 plumbing:** `client/src/x402/{handler,acquire,facilitator}.ts` — payment middleware, acquire helper, facilitator client. Functional.

**Storage:** Operator nodes have a local store (`client/src/store/store.ts`). x402 routes (`GET /x402/artifacts/:id/content`) serve content from the local store with payment middleware. **But.** `uploadArtifacts` (`client/src/restorer/engine/packaging.ts:387-460`) currently uploads *every* artifact to IPFS as base64-wrapped JSON, regardless of `access: 'x402-gated'` tag. The schema exists; the gate is bypassed. Anything tagged `x402-gated` is still publicly readable from any IPFS gateway.

This is the surgical fix that unlocks the whole pricing story. It is a few-day infrastructure change: stop pushing gated content to IPFS, push only the manifest pointer + access metadata, serve content from the operator node via the existing x402 routes.

**Retrieval API:** Does not exist yet as a network-wide service. The skeleton lives in MCP tools (`client/src/mcp/server.ts:160-230`) — `publish_artifact`, `search_artifacts`, `acquire_artifact` — but they query a *local* store. Promoting them to query the subgraph + acquire from peer operators' x402 endpoints is the second piece of Phase A.

### 4.3 Apps — mostly missing

There is no canonical knowledge-marketplace app today. There is no UI surface where a buyer comes, queries the corpus, gets a quote, and pays. There is no agent-SDK exposing the same flow programmatically. Phase A and Phase B build these.

What does exist that gets folded in:

- The default learning restorer spec (`docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`) is, in effect, the **canonical agent-as-buyer**. Its Orient and Debrief phases are explicitly the consumption points where an agent reads past trajectories. It's the first concrete demonstration that the agent-as-buyer pattern works — and Phase C is its wiring.
- The MCP tool skeleton sketches the agent-side shape; Phase A promotes them from local-store to network-wide.

### 4.4 Net

Protocol: ~80% built; royalty-split primitives are the main near-term addition. Infrastructure: ~60% built; gating leak is the load-bearing fix; retrieval API needs promotion to network scope. Apps: ~10% built; the canonical knowledge marketplace is the biggest piece of new construction.

The encouraging shape: **the smallest amount of new construction is at the protocol layer; the bulk of the work is infrastructure ops + the first apps.** That's the right shape — protocol is supposed to be slow-changing once correct.

---

## 5. Phases

The phasing follows from layer dependencies. Infrastructure must work before apps can sit on top. The protocol must support royalty primitives before apps can split payments correctly. Apps come last in the dependency chain but first in the user-visible chain.

### Phase A — Close the gating leak. Promote retrieval to network scope. (Weeks.)

The smallest set of changes that makes pricing structurally possible.

- Stop publishing `x402-gated` content to IPFS. Publish manifest + access pointer only. Serve content via the existing x402 routes from operator nodes. (`client/src/restorer/engine/packaging.ts`.)
- Promote MCP `search_artifacts` / `acquire_artifact` to talk to the subgraph and to peer operators' x402 endpoints, not just the local store.
- Default new envelopes to **gated-at-zero**. Forces the path through subgraph + retrieval-API + x402 acquire even when content is currently free. Prices kick in later by setting `priceUsdc` non-zero. The Captain's instinct that the path itself is the structural prerequisite, not the price.
- Subgraph: surface a "purchasable / x402-endpoint" face on `Execution` so retrieval clients know where to acquire.

Acceptance: a buyer (human or agent) can query the subgraph for envelopes matching a predicate and pay-and-fetch the content from the producing operator's node. End-to-end on testnet. The gate actually gates.

### Phase B — Royalty primitives. Stand up the canonical knowledge marketplace.

Now that the path exists, build the first app and the protocol primitives it needs.

- Define royalty-split semantics at the protocol layer: when a retrieval settles, payment splits across the original envelope's operator, evaluator, and any cited components' creators in declared shares. v0: declared in envelope metadata, executed off-chain in the retrieval API. Move to on-chain settlement when volume warrants.
- Decide whether to add component-level access policy (gating per-component within an envelope, not just at envelope boundary) — Phase B or Phase B.5 depending on demand.
- Stand up the canonical knowledge-marketplace app: search, request creation, retrieval, billing, royalty bundling. Could be one unified UI or split into "request" and "search" surfaces — product call.
- Begin metering retrieval usage in subgraph state so reputation and supply-side incentives can read it.

Acceptance: a buyer can issue a request OR a query through the marketplace app; the marketplace handles either path; payment splits correctly across upstream creators on settlement. End-to-end on testnet with a cohort of test buyers.

### Phase C — Agent-as-buyer SDK. Wire the default learning restorer.

The compounding loop becomes real.

- Promote MCP tools to a first-class agent SDK that talks to the network retrieval API + posts requests through the protocol, paying via the agent's wallet.
- Wire the default learning restorer's Orient and Debrief phases to consume the corpus over the network — the spec already calls for "others' run history when accessible," and this is what "accessible" means structurally now that the path exists.
- Ship the harness adapter contract (Claude Code + Pi.dev) per the learner spec §8, with the network retrieval API as a required capability.
- Acceptance test: a learner restorer executes an intent, queries the corpus mid-run for analogous past trajectories, pays the upstream creators, applies what it learned, produces a measurably-better trajectory in its `Improve` phase. The agent-to-agent loop demonstrably compounds.

This is where the harness pattern earns its keep. The default learning restorer is **the canonical agent-as-buyer** — the first restorer designed to consume Jinn's market in production. Every other restorer impl that adds a knowledge-query phase becomes a participant in the same loop.

### Phase D — Ecosystem of apps.

The market exists. Multiple apps emerge.

- Bundlers and packagers that subscribe to the firehose, curate datasets, resell.
- Lab-tier access (bulk licensing, custom retention, x402 quoting at high volume).
- Compliance/provenance products for regulated buyers (EU AI Act, contamination-free timestamps).
- Vertical apps (DeFi research bundlers, code-debugging trace search, prediction-market analytics).
- ve-JINN demand-direction app: locking JINN biases emissions toward categories buyers want produced — implemented as aggregate persistent intents that the protocol settles. Feeds back into the supply formation loop from #41.
- Alternative indexers, alternative apps, alternative retrieval paths.

**Phase D is mostly *not Jinn*.** The protocol provides verifiable supply, component-level provenance, payment gating, evaluator signals, market pricing. External builders handle packaging, distribution, search, retrieval, analytics, enterprise access. Jinn does not become a monolithic data company. It becomes the trust + pricing substrate around which many data businesses can emerge.

---

## 6. Workstreams and the specs that touch them

### Phase A workstreams

| Workstream | Layer | Touches | Spec / plan |
|---|---|---|---|
| Gate enforcement | Infra | `packaging.ts`, IPFS upload path | New short spec; ~1 week of work |
| Network retrieval API | Infra | `client/src/api/`, `client/src/mcp/`, `client/src/x402/` | New spec extending envelope-tee-scope access policy |
| Subgraph "purchasable" surface | Infra | `subgraph/schema.graphql` | Schema migration, no new spec |
| Default-gated envelope policy | Protocol | `client/src/restorer/engine/envelope-assembly.ts` | Decision record, not a spec |

### Phase B workstreams

| Workstream | Layer | Touches | Spec / plan |
|---|---|---|---|
| Royalty-split semantics | Protocol | New module + envelope schema extension | **New canonical spec — biggest design surface in this phase** |
| Component-level access policy | Protocol | Envelope schema, packaging | Extends `2026-04-27-erc-8004-payload-schema.md` |
| Knowledge-marketplace app MVP | App | New service or web app | New spec; product-shaped (one surface or two) |
| Retrieval metering | Infra | Subgraph + reputation reads | Schema extension |

### Phase C workstreams

| Workstream | Layer | Touches | Spec / plan |
|---|---|---|---|
| Agent-as-buyer SDK | App / infra | MCP server promoted to network-aware | Extends `2026-04-14-client-surface.md` |
| Default learning restorer wiring | App | Existing 4 plans + new plan for knowledge-query phase wiring | `docs/superpowers/plans/2026-04-26-default-learner-*.md` |
| Harness adapter contract | App | Claude Code + Pi.dev adapters | Per learner spec §8 |
| Internal-loop acceptance test | App | Cross-operator portfolio.v0 + learner | New conformance test |

### Phase D workstreams (sketched, not committed)

| Workstream | Notes |
|---|---|
| Bulk lab-access tier | Lives outside the protocol — partner-built |
| ve-JINN emission direction | Tokenomics extension; revisits Phase 1a tokenomics |
| Search / packaging / bundler ecosystem | Open invitation; protocol provides primitives |
| Compliance / provenance products | Regulated-buyer surface; partner-built |
| Alternative indexers | Already structurally supported |

---

## 7. Why decentralisation is the edge — restated against the layers

`THESIS.md` §5 names the four properties: less extractive, more neutral, more composable, more efficient. They map cleanly onto the three-layer cut.

**Less extractive.** At the protocol layer, payouts route directly from buyer to creator (operator + evaluator + cited components). The protocol does not take a margin; what the DAO takes (if anything) is governance-set, not platform rent. Operators are willing to disclose because the protocol does not eat their margin on every transaction. Closed competitors structurally must extract — investors require it.

**More neutral.** At the protocol layer, anyone can post intents and anyone can run an indexer. No privileged class of buyer or seller. Labs that compete with each other can both buy from the same Jinn corpus without antitrust theatre. Regulators, governments, the open-source ecosystem can all be participants without being competitors of each other inside the protocol.

**More composable.** The protocol/infrastructure/apps split is itself the composability claim. The protocol stays narrow; infrastructure is plural; apps proliferate. Component-level provenance + open subgraph(s) + open x402 endpoints = anyone can build a search engine, a packager, a vertical bundler, a compliance product on top. The combinatorial frontier is structurally larger than what a closed platform can build itself.

**More efficient.** Direct buyer→creator payouts route higher fractions of revenue to producers than any centralised data marketplace can. Every margin layer (Scale AI's labour managers, OpenAI's corporate overhead) compounds against unit economics; the protocol has none of those. More of every dollar reaches compute and creator.

These compound. The internal compounding loop is the fifth, derived advantage: memory accumulates faster in an open population than in any single shop.

---

## 8. What this discussion does not decide

This document is the framing artifact. It commits to the vision, the three-layer cut, and the phase sequencing. It does not commit to:

- The exact royalty-split semantics (Phase B spec)
- Whether component-level pricing lives in v0 of Phase B or slides to Phase B.5
- Whether the canonical knowledge marketplace is one app (unified request+query UX) or two (separate "commission new" and "search corpus" surfaces) — product call during Phase B
- The on-chain vs off-chain boundary for royalty-split execution
- The Phase 1b roadmap reshuffle implied by this phasing (separate decision)
- ve-JINN demand-direction mechanics (Phase D, or sooner if pulled forward)
- Permission-granting / outcome-execution-on-buyer-resources — *deliberately not part of this protocol's surface*; if it ever enters, it is a separate primitive in a separate doc

---

## 9. Asks of the team

Three concrete asks:

1. **Pressure-test the framing.** The end-state (knowledge market with a uniform buy primitive), the three-layer cut (protocol / infrastructure / apps), the dependency-ordered phasing — push back where the cuts are off.
2. **Validate the code reading.** Especially the "gating-plumbed-but-leaking" claim and the "80%/60%/10%" estimate. Anything I missed or got wrong?
3. **Prioritise Phase A vs Phase 1b.** Phase A is small, surgical, and unblocks the biggest structural gap. Whether it slots alongside Phase 1b work or displaces something is a separate operational decision that follows from agreeing with this framing.

---

## References

- [Discussion #41 — Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41)
- `THESIS.md` — canonical thesis (decentralisation as edge)
- `spec/2026-04-21-agentic-data-substrate.md` — first articulation of Jinn-as-data-substrate; this document collapses that framing into the knowledge-market end-state and adds the three-layer cut + agent-as-buyer dimension
- `spec/2026-04-29-thesis.md` — meta-spec promoting `THESIS.md` to canonical
- `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md` — the canonical agent-as-buyer (Phase C anchor)
- `docs/superpowers/specs/2026-04-23-jinn-execution-envelope-tee-scope.md` — envelope, trajectory, access policy
- `docs/superpowers/specs/2026-04-27-erc-8004-entity-model-design.md` — operator + reputation entity model
- `client/src/restorer/engine/packaging.ts:387-460` — the gating leak
- `client/src/x402/{acquire,handler,facilitator}.ts` — payment plumbing
- `client/src/mcp/server.ts:160-230` — agent-as-buyer skeleton (`publish_artifact`, `search_artifacts`, `acquire_artifact`)
- `subgraph/schema.graphql` — discovery substrate (canonical indexer; protocol does not depend on it)

---

*Discussion draft — do not cite as committed direction.*
