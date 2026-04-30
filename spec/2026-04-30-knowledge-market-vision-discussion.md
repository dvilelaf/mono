# Jinn as the knowledge market — substrate vision, gates, and the work to get there

**Status:** Discussion draft
**Date:** 2026-04-30
**Author:** ritsukai (sitting with Opus)
**Related:**
- [Discussion #41 — Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41) — the thesis lineage this document continues.
- [Discussion #57 — Unified GTM around the Prediction SolverNet (oaksprout)](https://github.com/Jinn-Network/mono/discussions/57) — sibling discussion. This document is the *substrate / vision* layer; #57 is the *GTM / campaign* layer. The technical spec follow-up that #57 asks for sits underneath both.

This is a discussion draft, not a commitment. It exists to give the team a single picture of what Jinn is becoming, what the layers and gates look like, and which workstreams matter. Push back where the framing is off.

---

## TL;DR

**Jinn is the open knowledge market that compounds faster than closed labs.** Operators run intents and produce trajectories as a byproduct. Anyone with a wallet can buy that knowledge — humans, labs, vertical AI companies, end users, and operators in the middle of doing their own work. There is one buy primitive and no buyer classes.

The compounding loop falls out automatically: **the same population producing the corpus is also reading from it.** Operator A's trajectory becomes operator B's input; B's becomes C's input; the corpus monotonically grows in coverage and average quality. Closed self-improving systems (Voyager, ADAS, Sakana, OpenAI's o-series) compound inside one shop, bounded by their employees and internal data. Jinn opens that loop. The producing population is structurally larger than any institution can employ — and that is the structural advantage no closed lab can replicate, because the moment they open it, they stop being closed.

The system splits into three layers. **Protocol** — on-chain contracts, envelope schemas, signing rules, tokenomics. The neutral substrate. **Infrastructure** — subgraph indexers, storage backends, x402 facilitators, retrieval primitives. Replaceable, plural. **Apps** — user-facing surfaces. The first app is **the corpus library SDK** — a thin convenience layer over existing primitives, primarily targeting operators-as-buyers in the middle of their own work.

The protocol is mostly built. Infrastructure is partial — there's a gating leak that defeats pricing today. Apps are missing entirely; the compounding loop *cannot exist* until the first app does. The phases below close those gaps gate-by-gate.

---

## 1. The compounding loop

Closed labs compound knowledge by default. Every run feeds back: traces, failures, evaluations, operational lessons stay inside the institution. Open networks have the opposite problem. They coordinate work from a wider surface area but most of what they buy is an *output*, not the knowledge that produced it. The knowledge either stays private (and the network cannot learn) or becomes public for free (and the best operators stop investing).

Discussion #41 named this tension and proposed: turn execution knowledge itself into a priced asset. This document accepts that frame and tightens it.

**One market, one buy primitive, anyone can use it.** A trader, a developer, a fund, an open-weights lab, a regulated enterprise, a researcher, an end user, an operator doing its own work — they all use the same primitive. Pay, get knowledge. Same envelopes, same gating, same x402 rails, same evaluator scores, same reputation. The protocol makes no distinction between buyer types.

**The compounding loop is not a separate mechanism.** It is what happens automatically when the same population that produces trajectories is also reading from them. An operator producing a portfolio strategy pulls past portfolio trajectories to inform its own approach. An operator producing a prediction pulls past evaluator notes about similar markets. An operator debugging a contract pulls past debugging trajectories. The agent is not *serving* another agent — it is *learning from past work* (its own and others') so its own current work is better. The corpus compounds because its participants both feed it and read from it.

**The strongest expression of the loop is a self-improving harness.** Most agents that read from the corpus consume passively — they look up a fact, apply it, move on. A self-improving harness goes further: it reads, then **revises its own strategies, skills, or code based on what it read**, then produces a measurably-better trajectory next time. Two layers of compounding: corpus-level (more good knowledge) and harness-level (each operator's harness gets smarter run over run). Voyager, ADAS, Sakana AI Scientist, OpenAI's o-series — all closed-shop instantiations of this pattern. **Jinn is the open substrate where open-source self-improving harnesses can run** alongside operators with simpler implementations, each compounding through the same shared corpus.

**The bootstrap is optimistic by default.** The system ships with `priceUsdc = 0` as the envelope default. Everything is free at launch — gating + payment plumbing live so the *path* is structural, but no operator is asked to charge until they're ready. **Pricing is opt-in, asynchronous, and emerges from operator confidence, not protocol mandate.** Markets discover price organically, kind by kind, as operators see their work being valuable enough to charge for.

But the loop only exists if there is a path from operator → corpus → relevant past trajectories. **Without that path, the corpus is inert no matter how rich.** The first app on top of Jinn is what creates the path. It is primarily targeted at operators-as-buyers in the middle of doing their own work — a programmatic library, not a UI.

---

## 2. The thesis in one line

> **Jinn is the open knowledge market that compounds faster than closed labs.**

Three things to notice about that framing.

**"Knowledge," not "outputs."** A prediction, a swap, a scored answer is an output. The trajectory that produced it — context, plan, prompts, tool calls, sources, intermediate observations, failed branches, evaluator notes, outcome proof — is the knowledge. Pricing knowledge dominates pricing outputs because the output is consumed once and the knowledge is reusable forever.

This isn't pricing knowledge *instead* of caring about outputs — it's pricing knowledge *because* it makes outputs better. When operators read each other's trajectories to inform their own work, predictions get more accurate, trades better-timed, answers more reliable, decisions better-grounded. The corpus compounds *and* the outputs the network delivers get better. Both are true; they reinforce each other.

**"Anyone."** No buyer classes. No "labs vs. end users vs. agents." Anyone with a wallet who wants knowledge issues a request and pays. The market does not care who they are or why. This is the property that makes the compounding loop fall out for free — operators-as-buyers don't need a separate mechanism, they just use the same primitive everyone else uses.

**"Compounds faster than closed labs."** Open population × open corpus × producer-consumer overlap > closed institution × internal corpus × employee compounding. The structural advantage runs in two dimensions: more people producing, and producing happens against a richer base than any one institution can match. Closed systems cannot replicate this because the moment they open the loop, they stop being closed.

---

## 3. The three layers

Jinn splits cleanly into three layers. Each has a different role, a different audience, and a different rate of change.

### 3.1 Protocol — the substrate

The protocol is what makes execution knowledge tradeable. It is the set of rules and on-chain primitives the network agrees on. Neutral, slow-changing, governance-controlled. What cannot be forked away from because participants have anchored real economic activity into it.

What sits at this layer:

- **Solution-request specification.** The schema for an intent: kind, predicate, window, eligibility, escrow. *Anyone with a wallet can post one* — open access is what makes the decentralisation claim real. Today: `JinnRouter`.
- **Operator economics.** Registration, staking, reputation, payout. Today: ERC-8004 IdentityRegistry + ClaimRegistry + ReputationRegistry, plus tokenomics.
- **Execution envelope schema.** The trajectory format — components, signatures, tier (self-signed → committed → consensus → attested → proved), public/private boundary, content-addressing rules. Today: `client/src/types/envelope.ts` + the envelope spec.
- **Settlement primitives.** x402 payment, claim primitives. **Single-creator / single-payment per envelope. No royalty splits, no DRM, no per-component pricing.** Once a buyer has fetched content, what they do with it (cache, share, resell) is their concern; the protocol does not track or enforce.
- **Storage rules.** The contract between content addressing and access control: gated content carries an access pointer, not bytes; ungated content can be public-addressable.

The protocol does **not** include a query language for the corpus, an indexer, a storage backend, or a UI. Those are infrastructure or apps.

The protocol is **mostly built**. The remaining work at this layer is small — most additions are deferred (royalty splits explicitly out; component-level pricing explicitly out; permission-granting for outcome-execution-on-buyer-resources explicitly out — that is not Jinn's surface).

### 3.2 Infrastructure — the operational stack

Infrastructure is what runs alongside the protocol to make it usable. Replaceable, plural, **not** load-bearing for decentralisation. Infrastructure indexes the protocol's state, stores envelope content, mediates payments, and exposes APIs that apps consume.

What sits at this layer:

- **Indexers.** The subgraph is the canonical Jinn indexer today, but the protocol does not depend on it. Anyone can run their own indexer over the same on-chain events. Multiple parallel indexers are healthy — they are the structural answer to "single point of trust for discovery."
- **Storage backends.** Operator nodes serving x402-gated content. IPFS for non-gated content where public availability is desired (manifests, public artifacts).
- **x402 facilitators.** Settlement rails between buyer payment and content delivery. Today: in `client/src/x402/`.
- **Retrieval primitives.** The path of "manifest → access metadata → x402 acquire → content delivery." Today: skeletal in MCP tools (`publish_artifact`, `search_artifacts`, `acquire_artifact`) but operating against a local store, not the network.

Infrastructure is the layer where the **gating leak** lives. The leak is operational — content gets uploaded to public IPFS even when tagged `x402-gated`, defeating the gate. Fixing it doesn't require a protocol change; it requires an infrastructure change to the publish path.

### 3.3 Apps — the products on top

Apps are user-facing surfaces. They translate human (or agent) intent into protocol-level operations, owning UX, ranking, selection rules, billing, business models. There can be many apps on the same protocol over time; their order of arrival matters because the compounding loop depends on the *first* one existing.

**The first app: the corpus library SDK.** A thin convenience layer in `client/src/corpus/` that bundles the multi-step "query subgraph → fetch manifest → apply selection → x402-acquire → cache → return" flow into a single programmatic call. **It is not a new discovery surface — the subgraph already provides discovery.** It's a small library (~hundreds of LOC) that operators-as-buyers can import to read from the corpus inside their own restorer phases. Per-operator local caches in v0; a `routeResolver` hook lets shared caches drop in later as a Phase D evolution.

**The default harness as the campaign's reference implementation.** The default-learning-restorer (Claude Code learner) is the network's seed solver and the runtime that components plug into. Its phase pipeline (Orient / Strategize / Plan / Execute / Debrief / Improve / Memory) is already specified — the work is to make those slots **publicly pluggable** so external components can drop in without forking the package. Once that's done, two recruitment paths fall out:

- **Contribute a component into the default harness's slots** — low-friction path for builders shipping at one layer (a specific refiner, judge, planner, memory backend). Drops in via the plug-in mechanism.
- **Ship your own full harness** — higher-control path for builders with working monoliths (Voyager-clones, custom architectures, specialist agents). Implements the protocol-level `RestorerImpl` interface end-to-end; internals stay theirs.

Both paths produce supply. Neither requires the builder to refactor their existing work into our taxonomy. *"Plug your component into our default harness, or bring your own — either way your work compounds with the rest of the network via the corpus."*

**Apps may unify request-and-query into one surface or split them — product choice, not protocol decision.** The protocol underneath has two distinct mechanisms (post-intent, read-corpus) with different freshness/latency/price profiles; apps decide whether to surface them as one or two products. The first canonical app is a programmatic library; later apps may be UIs.

**Apps are also where business models live.** The protocol takes no margin; apps capture margin on the value they add (caching, latency, aggregation, ranking, packaging, search, UI). Operators are naturally positioned to run apps because they already run the infrastructure — turning a private cache into a paid service, for example, is a deployment-config change rather than new construction.

---

## 4. Where the code actually is

Honest take, layer by layer. References point at real paths so the gaps are concrete.

### 4.1 Protocol — solid

`JinnRouter` request creation + delivery is live. `IdentityRegistry`, `ValidationRegistry`, `ReputationRegistry`, `ClaimRegistry` are deployed. Envelope schema is well-defined (`client/src/types/envelope.ts`, the envelope-tee-scope spec). Evaluator restorer impls exist per kind (`client/src/restorer/impls/{portfolio,prediction,prediction-apy}-v0-evaluator/`). Multi-evaluator consensus is single-evaluator today; that's a Phase B concern, not a structural protocol gap.

**Executor provenance is already in the schema.** Every envelope carries an `Executor` field naming the harness that ran (`implName`, `implVersion`, `clientGitSha`, `codeDigest`, `signingKey`). At self-signed and committed tiers these are references; at attested tier the envelope additionally carries a `SourceBundle` (publicly-fetchable IPFS CID + build recipe + enclave measurement) so anyone can fetch the source, build it from the recipe, verify the measurement matches the TEE's output, and confirm exactly what code ran. This means at attested tier (Phase B.1), every harness-builder's source becomes part of the verifiable provenance graph — fetchable, buildable, comparable per envelope it produced.

No new protocol surface is needed for Phase A. Protocol additions are deferred to Phase B research.

### 4.2 Infrastructure — the gating leak is here

This is where the load-bearing operational gap sits.

**Subgraph (canonical indexer):** indexes Executions with `manifestCid`, `payloadVersion`, `tier`, `kind`, plus the full operator/validation/feedback graph (`subgraph/schema.graphql`). The discoverable surface is healthy. *Operationally this is the canonical indexer; the protocol does not depend on it.*

**x402 plumbing:** `client/src/x402/{handler,acquire,facilitator}.ts` — payment middleware, acquire helper, facilitator client. Functional.

**Storage:** Operator nodes have a local store (`client/src/store/store.ts`). x402 routes (`GET /x402/artifacts/:id/content`) serve content from the local store with payment middleware. **But.** `uploadArtifacts` (`client/src/restorer/engine/packaging.ts:387-460`) currently uploads *every* artifact to IPFS as base64-wrapped JSON, regardless of `access: 'x402-gated'` tag. The schema exists; the gate is bypassed.

This is the surgical fix that unlocks the whole pricing story. Stop pushing gated content to IPFS, push only the manifest pointer + access metadata, serve content from the operator node via the existing x402 routes. The manifest itself stays on IPFS — it's public discovery info; only gated artifact *content* is withheld from public storage.

**Retrieval primitives:** the path exists in pieces but not as a coherent library. The MCP tools (`client/src/mcp/server.ts:160-230`) sketch the agent-side shape against a local store; the x402 acquire helper exists; the subgraph is queryable. **The first app's job is to compose these into one library call.**

### 4.3 Apps — missing entirely

There is no corpus library. There is no public plug-in surface for the default harness. There is no programmatic SDK for operators-as-buyers. **The compounding loop the whole vision rests on does not exist in operational form because the path from operator to corpus does not exist.**

What does exist that gets folded in:

- **The default-learning-restorer spec** (`docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`) defines the canonical agent-as-buyer's internal architecture (the seven-phase pipeline). Phase A wires Orient/Debrief to read from the corpus library and exposes the phase pipeline as a public plug-in surface.
- **MCP tools sketch the agent-side shape** at the local-store level; Phase A promotes them to the network.

### 4.4 Net

Protocol: solid. Infrastructure: partial — gating leak is the load-bearing operational fix. Apps: the corpus library and the public plug-in surface for the default harness are the two new pieces of construction. **Most of what's needed for the loop is small surgical work; the gap is real but contained.**

---

## 5. Phases — gate-paced

The phasing is **gate-paced, not time-paced.** Each sub-phase advances when its gate trips. Build-side gates ("the code is ready") and recruit-side gates ("the community is ready") both apply — every phase has at least one of each, because the substrate is only real when someone is using it.

### Phase A — Operational loop + campaign-ready surface

| Sub-phase | Gate |
|---|---|
| **A.1 Loop** | Cross-operator end-to-end test passes on testnet: operator B's restorer queries the corpus for analogous trajectories, pays operator A via x402, fetches, verifies content hash, applies. *The path works.* |
| **A.2 Plug-in surface** | Default harness has publicly pluggable internal slots; at least one external component lands in a default-harness slot **and** at least one external full-stack harness lands via the bring-your-own path. *Both recruitment paths demonstrably work.* |
| **A.3 Campaign infrastructure** | Polymarket-derived intents auto-posting on testnet; default harness producing visible forecasts; Brier-vs-Polymarket dashboard live publicly. *(Aligns with the GTM plan in #57.)* |
| **A.4 Campaign-launch ready** | Worked example per layer at the warmest candidate (the first-integrator-experience constraint from #57 §3); recruitment-grade docs; component funnel + operator broadcast infrastructure operational. **Campaign launches when this gate clears.** |

System state at end of Phase A: the operational loop runs in **optimistic mode** — everything priced at zero, agents pulling from the corpus to inform their own work, gating + payment plumbing live so any operator can flip the price field when they're ready. The compounding claim becomes empirically testable. Open-source self-improving harness builders can plug in. The campaign launches.

### Phase B — Trust infrastructure (parallel after A.1 ships)

| Sub-phase | Gate |
|---|---|
| **B.1 Verifiability tier activation** | At least one envelope produced at attested or consensus tier on testnet; trust-tier signal queryable through the corpus library. *Operationalises the existing envelope-tee-scope spec.* |
| **B.2 Evaluator economics + signal-design** | Research note → canonical spec ratified → first stake-based evaluator run on testnet. *Multi-evaluator consensus is one candidate mechanism, not the answer; the research workstream surfaces the right mechanism per kind.* |

Phase B does not gate Phase A's launch. The optimistic-mode loop runs in low-trust mode; trust upgrades enrich what's already running rather than block it.

### Phase C — Human-facing surfaces (gated by community formation)

| Sub-phase | Gate |
|---|---|
| **Mainnet readiness** | Three conditions simultaneously: (a) 15–20 distinct people meeting at least one of the four bars in #57 §1.1 (community formation); (b) Phase B trust infrastructure has shipped at least the verifiability tier (B.1) and the first stake-based evaluator run (B.2); (c) **the security audit of the deployed contract stack is complete with findings addressed and signed off** (cross-cutting workstream below). |
| **C.1 Flagship marketplace API** | First non-agent buyer (a lab, a researcher, an end-user) transacts through the API. *The flagship is the API, not the UI — UIs are downstream.* |

### Phase D — Ecosystem (no hard gate; emergent)

Tracked by counts: distinct external apps shipping; alternative indexers; shared-cache businesses; specialist agent harnesses other than the default. No advancement gate — this phase is open-ended by design.

### Hard reversion gates (from #57 §5.1)

| Gate | Trips |
|---|---|
| **Component-side reversion** | 12 weeks from A.4 complete with zero external integrations landed → forced retrospective. Possible outcomes pre-listed (extend with new hypothesis / narrow / revert / pause). |
| **Product-side reversion** | 26 weeks from A.3 dashboard live with rolling 12-week Brier-spread persistently negative AND trend flat or negative → forced product retro. |

Both are pre-committed; the strategy's credibility comes from being willing to retro publicly when the threshold trips.

---

## 6. Workstreams and the specs that touch them

### Phase A workstreams

| Workstream | Layer | Spec / plan |
|---|---|---|
| Gate enforcement (gating leak fix) | Infra | Folded into the Phase A umbrella spec |
| Manifest access hygiene | Infra | Folded into the Phase A umbrella spec |
| `client/src/corpus/` library | App | **New canonical spec — the first-app design** (in the umbrella) |
| Cache table in `store.ts` | App | Schema migration only |
| MCP rewiring | App | Decision record |
| Default-gated envelope policy | Config | Decision record |
| Default-harness plug-in surface | App | **New canonical spec — pluggable phase pipeline + scaffolding for both recruitment paths** |
| Default-harness network integration | App | New plan extending `docs/superpowers/plans/2026-04-26-default-learner-*.md` |
| Polymarket-derived intent posting | App + integration | New plan; extends existing prediction-v0 stack |
| Brier-vs-Polymarket dashboard | Infra + App | New plan |

Phase A consolidates into roughly two new canonical specs (umbrella spec covering loop + library; plug-in surface spec) plus implementation plans, plus decision records.

### Phase B workstreams

| Workstream | Layer | Spec / plan |
|---|---|---|
| B.1 Verifiability tier activation | Protocol + Infra | **Operationalises** existing envelope-tee-scope spec; implementation plan needed |
| B.2 Evaluator economics + signal-design research | Research → Protocol | **New research note** evaluating evaluator models → **canonical design spec** → implementation |

### Phase C workstreams

| Workstream | Owner | Spec / plan |
|---|---|---|
| C.1 Flagship marketplace API | In-house | New product spec; the *one* canonical app the team ships |
| Builder recruitment (lab-tier, vertical bundlers, compliance products, UIs on top of the API) | Partner / community / open invitation | The doc names categories without committing to ship them |

### Phase D workstreams

| Workstream | Notes |
|---|---|
| Shared cache apps | Anyone can ship; routeResolver hook from Phase A absorbs them. *Optional*: a reference design so first builder has a starting point. |
| Vertical bundlers, alternative indexers, specialist harnesses | Open invitation; protocol provides primitives |

### Cross-cutting workstreams

| Workstream | Where |
|---|---|
| Telemetry / metrics on compounding signal AND Brier accuracy | Phase A acceptance requires this; named workstream |
| Operator outreach to component-builders | Phase A.4 → ongoing |
| Operator broadcast (forecast accuracy posts) | Starts when A.3 dashboard ships |
| **Security audit of the deployed contract stack** | Tangential to the substrate vision but **necessary for mainnet readiness**. Runs parallel to Phase A/B. Workstream has three rough stages: (1) **tooling survey** — what audit tools are available now, including AI-enabled analysers (Slither, Mythril, newer LLM-driven static-analysis tools); (2) **audit plan** — scope, methodology, prioritisation, draws on community expertise (Alex, Andre); (3) **execution** — running the audit, addressing findings, sign-off. Has its own spec and is gated by the mainnet readiness criterion below. |
| Phase 1a/1b roadmap reconciliation | Operational, not a spec |
| **Future discussion: evaluator economics** | Opens parallel to / triggered by Phase B research |
| **Future discussion: ve-JINN demand-direction** | Tokenomics design surface; opened separately |
| **Future discussion: builder recruitment strategy** (paired with #57) | Ongoing; #57 is its current home |

### Existing specs being subsumed or extended

| Existing spec | Status under this framing |
|---|---|
| `THESIS.md` | Unchanged — canonical thesis stands. Possible §5b update (per #57) to name the producer-consumer overlap mechanism explicitly. |
| `spec/2026-04-21-agentic-data-substrate.md` | **Subsumed** by knowledge-market end-state; reference as historical articulation |
| `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md` | **Anchor for Phase A** — implementation extends this; phase pipeline becomes the publicly pluggable surface |
| `docs/superpowers/specs/2026-04-23-jinn-execution-envelope-tee-scope.md` | **Anchor for Phase B.1** — implementation operationalises this |
| `docs/superpowers/specs/2026-04-27-erc-8004-entity-model-design.md` | Unchanged; operator entity model stands |
| `docs/superpowers/plans/2026-04-26-default-learner-*.md` (4 plans) | Anchor for the network-integration plan extending them |
| `docs/research/2026-04-23-verifiability-traceability.md` | Foundation reference for Phase B.1 |

---

## 7. Why decentralisation is the edge — restated against the layers

`THESIS.md` §5 names the four properties: less extractive, more neutral, more composable, more efficient. They map cleanly onto the three-layer cut.

**Less extractive.** At the protocol layer, payouts route directly buyer → creator. The protocol takes no margin; what the DAO takes (if anything) is governance-set, not platform rent. Operators are willing to disclose because the protocol does not eat their margin on every transaction. **Apps capture margin on the value they add, not extracted from the protocol** — which is what makes the cache-as-business-model and other Phase D apps economically real for builders.

**More neutral.** At the protocol layer, anyone can post intents and anyone can run an indexer. Labs that compete with each other can both buy from the same Jinn corpus without antitrust theatre. Regulators, governments, the open-source ecosystem can all participate without being competitors of each other inside the protocol.

**More composable.** The protocol/infrastructure/apps split is itself the composability claim. The protocol stays narrow; infrastructure is plural; apps proliferate. **The default harness's plug-in surface adds composability *inside* one operator implementation as well** — open-source self-improving harness builders can ship into a worked-on substrate rather than build their own coordination layer.

**More efficient.** Direct buyer→creator payouts route higher fractions of revenue to producers than any centralised data marketplace can. Every margin layer (Scale AI's labour managers, OpenAI's corporate overhead) compounds against unit economics; the protocol has none of those.

**The fifth, derived advantage: producer-consumer overlap.** The same population producing the corpus is reading from it. Memory accumulates faster in an open population than any single shop can match. That is the compounding curve no closed lab can replicate, because the moment they open the loop, they stop being closed.

---

## 8. What this discussion does not decide

This document is the framing artifact. It commits to the vision, the three-layer cut, and the gate-paced phase sequencing. It does **not** commit to:

- **Time estimates.** Phase A is gate-paced; the technical spec follow-up (per #57 §12) does the engineering estimation.
- **Whether component-level pricing ever lands.** Currently out of scope — single-creator/single-payment is the protocol.
- **Whether the corpus library SDK starts retrieval-only or includes request-posting.** Lean: retrieval-only first; the loop only needs reading from corpus to begin compounding.
- **Phase 1a/1b roadmap reshuffle.** Operational decision; #57 implies near-term Phase A pressure but the prioritisation is separate.
- **ve-JINN demand-direction mechanics.** Future discussion; tokenomics design surface.
- **Evaluator economics design.** Phase B research workstream + parallel future discussion.
- **Permission-granting / outcome-execution-on-buyer-resources.** Deliberately *not* part of the protocol. Outcome-acting-in-the-world is the buyer's concern, off-protocol.
- **THESIS.md updates.** Possible §5b addition (per #57) lives in its own spec PR.
- **Security audit plan + tooling shortlist.** The audit workstream is named here as mainnet-readiness-blocking; the actual plan, tooling shortlist, scope, and sign-off process are owned by an audit lead and live in their own spec, drawing on community expertise.

---

## 9. Asks of the team

Three concrete asks:

1. **Pressure-test the framing.** The end-state (knowledge market with uniform buy primitive), the three-layer cut, the producer-consumer overlap mechanism, the gate-paced phasing — push back where the cuts are off.
2. **Validate the code reading.** Especially the gating-leak claim and the "default-harness phase pipeline already specced; just needs to become publicly pluggable" claim. Anything missed or got wrong?
3. **Prioritise Phase A vs. existing Phase 1b.** Phase A is structured around #57's campaign launch and pre-commits to the 12-week first-integration threshold. Whether it slots alongside Phase 1b work or displaces something is a separate operational decision that follows from agreeing with this framing.

---

## References

- [Discussion #41 — Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41)
- [Discussion #57 — Unified GTM around the Prediction SolverNet](https://github.com/Jinn-Network/mono/discussions/57)
- `THESIS.md` — canonical thesis (decentralisation as edge)
- `spec/2026-04-21-agentic-data-substrate.md` — first articulation of Jinn-as-data-substrate; collapsed by this document into the knowledge-market end-state
- `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md` — canonical agent-as-buyer; phase pipeline becomes the publicly pluggable surface
- `docs/superpowers/specs/2026-04-23-jinn-execution-envelope-tee-scope.md` — envelope, trajectory, access policy; Phase B.1 anchor
- `docs/superpowers/specs/2026-04-27-erc-8004-entity-model-design.md` — operator + reputation entity model
- `client/src/restorer/engine/packaging.ts:387-460` — the gating leak
- `client/src/x402/{acquire,handler,facilitator}.ts` — payment plumbing
- `client/src/mcp/server.ts:160-230` — agent-as-buyer skeleton (local-store today; promoted to network in Phase A)
- `subgraph/schema.graphql` — canonical indexer (infrastructure; protocol does not depend on it)

---

*Discussion draft — do not cite as committed direction.*
