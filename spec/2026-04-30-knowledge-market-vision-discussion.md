# Jinn as the knowledge market — end-state, phases, and the work to get there

**Status:** Discussion draft
**Date:** 2026-04-30
**Author:** ritsukai (sitting with Opus)
**Lineage:** Sharpens [discussion #41 — Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41) by collapsing the framing into a single end-state, naming the layers it requires, and mapping current code to the phases ahead.

This is a discussion draft, not a commitment. It exists to give the team a single picture of where Jinn is going, what stands between us and that end-state, and which workstreams matter. Push back where the framing is off.

---

## TL;DR

**Jinn is the knowledge market for verified agentic execution knowledge.** Operators run intents and produce trajectories. Trajectories are priced, verified, and accessible to anyone who pays — labs, vertical AI companies, end users, *and other agents in the network*. The compounding mechanism is dual: external buyers fund supply, and **agents in the network buy each other's knowledge while fulfilling complex intents**, creating an intra-network learning loop closed labs cannot match.

This is not "decentralised Scale AI." It is a market structure where knowledge becomes a priced, attributable, reusable asset *and* the network has its own native consumers of that knowledge. Decentralisation is the edge — the open provenance graph cannot be forked, no operator captures, the buyer can audit the seller, and the network compounds memory faster than any single lab can.

The primitives are mostly built. The gap is the **buyer-side path**: gating that actually gates, discovery that returns quotes, settlement that pays the right people. The phases below close that gap.

---

## 1. The compounding loop

Closed labs compound knowledge by default. Every run feeds back into the next: traces, failures, evaluations, operational lessons, all of it stays inside the institution. Open networks have the opposite problem. They coordinate work from a wider surface area but most of what they buy is an output, not the knowledge that produced it. The knowledge either stays private (and the network cannot learn) or becomes public for free (and the best operators stop investing).

Discussion #41 named this tension and proposed: turn execution knowledge itself into a priced asset. This document accepts that frame and pushes one step further. It asks: **who buys?**

Two answers, one market.

**External buyers.** Labs, vertical AI companies, regulated enterprises, academics. Same buyer surface Scale AI / Mercor / Surge serve today, but for agentic execution traces with cryptographic provenance, contamination-proof timestamps, and economically-bonded quality signals. Larger than the existing data-labelling market because the asset class is new and the buyers haven't been able to acquire it any other way.

**Internal buyers — agents within the network.** This is the distinctive bet. An agent fulfilling a complex intent reads relevant past trajectories from other operators, pays the original creators their share, applies what it learned, produces its own trajectory, which becomes input to the next agent. Operator A's failure becomes operator B's lesson. Specialist evaluator C's scoring rubric informs aggregator D's quality filter. The corpus compounds *because the agents in it consume it*.

Both buyer classes transact in the same market. Same envelopes, same gating, same x402 rails, same evaluator scores, same reputation. They differ only in consumption pattern (bulk-train vs. mid-execution-read) and price elasticity (lab licensing vs. per-query lookup). Treating them as one market is a design choice — it keeps the protocol simple and lets supply scale across both demand sides.

The internal loop is the structural advantage. A closed lab can build internal compounding by running its own agents against its own data; what it cannot do is open that loop to operators it does not employ, or buy from a corpus its competitors also contributed to. Jinn's architecture admits both. Decentralisation is what makes it admit them.

---

## 2. The thesis in one line

> **Jinn is the open, verifiable market for agentic execution knowledge — where operators produce trajectories, anyone (humans, labs, agents) can buy them, and the network compounds intelligence faster than any single lab.**

Three things to notice about that framing.

**"Knowledge," not "outputs."** A prediction, a swap, a scored answer is an output. The trajectory that produced it — context, plan, prompts, tool calls, sources, intermediate observations, failed branches, evaluator notes, outcome proof — is the knowledge. The output is one component of the trajectory; pricing knowledge dominates pricing outputs because the output is consumed once and the knowledge is reusable forever.

**"Anyone."** The buyer surface is not labs. It is anyone who wants knowledge produced — a trader, a developer, a fund, an agent platform, an end user asking "what's the safest way to bridge X." Labs are one buyer class. They lock JINN, direct emissions toward the data they want produced, train on what comes out, and re-enter as solvers running their improved models — they metabolise the network rather than extracting from it (Oak's framing in #41). No takeover risk: labs that take and leave find no exclusive supply to leave with.

**"Compounds intelligence."** Most data marketplaces clear transactions. Jinn's distinctive property is that the act of selling knowledge into the market makes the next round of knowledge production better, because the next agent runs against a richer corpus. Volume × provenance × internal-loop = compounding curve.

---

## 3. What gets sold — two primitives, one market

The market needs two demand-side primitives. They share supply, settlement, and trust signals. They differ in whether they commission new work or retrieve existing assets.

**Outcome-intent (producer-side primitive).** *Today's intent.* "Do this work, deliver this outcome." A buyer expresses a desired state; an operator bids, runs, stake-bonds, executes; an evaluator scores; the trajectory is the deliverable; the outcome is one of its components. Async (minutes to hours). Operator margin + bond. This is what `JinnRouter` already coordinates.

**Knowledge-query (consumer-side primitive).** *New.* "Find/retrieve existing trajectories matching predicate P." The buyer pays a retrieval fee; the system returns metadata + a quote; payment unlocks decryption keys; royalties flow to the original creators of the matched envelope and its components. No new operator work; the asset already exists. Sync (sub-second). Royalty distribution to upstream creators.

These are isomorphic in the limit — "find trajectories matching P" can be modelled as a meta-intent ("execute corpus-search for P") and an operator runs it. But that abstraction is the wrong granularity for the consumer. Operator margin on every lookup breaks the economics of the internal loop, and async-by-construction breaks an end-user query's latency budget. The protocol unifies them at the storage and settlement layers; the user experience splits them at the demand layer.

The internal loop *requires* the knowledge-query primitive. An agent mid-execution cannot fire an outcome-intent every time it wants to read what worked last time. Knowledge-query is what makes the agent-to-agent loop tractable.

---

## 4. The architecture, in seven layers

What needs to exist for someone — anyone — to buy knowledge from Jinn:

**1. Production.** Operators run intents, emit envelopes carrying trajectories with structured components: plan, prompts, tool calls, source artefacts, intermediate observations, failed branches, evaluator notes, outcome proof, provenance metadata. Each component carries its own creator, sha, type, optional access policy.

**2. Verification & quality.** Evaluators score envelopes, multi-evaluator consensus reduces unilateral signal capture, the challenge mechanism surfaces contested cases, ERC-8004 binds verdicts to operators on-chain. Quality is bonded — evaluators stake and lose stake on bad calls.

**3. Gated storage.** Content-addressed *and* access-controlled. Metadata public on the subgraph (so discovery can run unpermissioned); content key-gated so it can be priced. **This is the missing structural primitive** — until content is actually private by default, no one can charge for it.

**4. Discovery & retrieval.** A buyer (human or agent) expresses a need; the system finds matching envelopes or components; returns metadata + quote; on payment, releases the keys/content. The "access layer" — what an end user actually talks to.

**5. Demand.** Two faces: outcome-intent (commission new work) and knowledge-query (retrieve existing). Same wallet, same envelope corpus, same evaluator signals; different request shapes and different settlement flows.

**6. Settlement & royalties.** x402-gated payment. Outcome-intent pays the operator who ran the work; knowledge-query distributes royalties across original creators of the matched envelope and its components (operator + evaluator + cited sources, per the provenance graph). This is where component-level provenance becomes a pricing feature, not a footnote.

**7. Reputation & memory.** Accumulated history of operators, evaluators, knowledge categories, buyer behaviour. The compounding moat — the part that cannot be forked because it is bound to the network's history of real economic activity, not to its code.

Layers 1–2 produce supply. Layer 3 makes pricing possible. Layers 4–6 are the buyer-facing path. Layer 7 is what makes Jinn defensible against any subsequent imitator.

---

## 5. Where the code actually is

Honest take, layer by layer. References to actual paths so the gaps are concrete.

**Production — solid.** Restorer engine (`client/src/restorer/engine/`) walks intents, runs `RestorerImpl` per kind (portfolio.v0, prediction.v0, prediction-apy.v0, learner-loop), assembles envelopes (`envelope-assembly.ts`), packages artefacts with declared `access` (`packaging.ts`), delivers via `JinnRouter` (`delivery.ts`). Trajectory schema, hash chain, secret-scrub all in `client/src/trajectory/`.

**Verification & quality — partial.** Evaluator restorers exist (`client/src/restorer/impls/{portfolio,prediction,prediction-apy}-v0-evaluator/`). ERC-8004 ValidationRegistry / ReputationRegistry are deployed and indexed on the subgraph (`subgraph/schema.graphql` — `Validation`, `Feedback`, `Operator`, `Execution` entities). **Single-evaluator today**; multi-evaluator consensus, scalar reward signal, formalised challenge → hard-example pipeline are the obvious upgrades (Tier 2 in `spec/2026-04-21-agentic-data-substrate.md`).

**Gated storage — *plumbed but not enforced*.** This is the load-bearing finding. The schema exists: `access: { kind: 'open' | 'x402-gated', endpoint?, priceUsdc? }` (`packaging.ts:41`). The serving routes exist: `GET /x402/artifacts/:id/content` with payment middleware (`client/src/x402/handler.ts`). The acquire helper exists: `acquireArtifactWithPayment` (`client/src/x402/acquire.ts`). What does not exist is the *gate itself*: `uploadArtifacts` (`packaging.ts:387-460`) uploads every artifact to IPFS regardless of `access` tag, as base64-wrapped JSON. Anything tagged `x402-gated` is currently still publicly readable from any IPFS gateway. Closing this is not a new system; it is a few-day surgical fix — stop pushing gated content to IPFS, push only the manifest pointer + access metadata, serve content from the operator's local store via the existing x402 routes.

**Discovery & retrieval — partial-skeleton.** The subgraph already indexes Executions with `manifestCid`, `payloadVersion`, `tier`, `kind`, plus the full operator/validation/feedback graph. That *is* a metadata-public discovery layer — anyone can issue a GraphQL query. What is missing is a **buyer-facing retrieval API** that wraps the GraphQL surface, returns price quotes, and shells through to x402 acquisition. The MCP server already ships agent-side primitives — `publish_artifact`, `search_artifacts`, `acquire_artifact` (`client/src/mcp/server.ts:160-230`) — but they query a *local* store and don't yet talk to the subgraph or other operators' x402 endpoints.

**Demand (outcome-intent) — solid.** `JinnRouter` request creation + delivery (subgraph entity `RouterJob`), intent posting service (`client/src/intents/posting-service.ts`), kind catalogue (`client/src/intents/kinds/`), claim registry adapters. This side of layer 5 is built.

**Demand (knowledge-query) — does not exist as a network primitive.** The MCP `search_artifacts` + `acquire_artifact` tools sketch the local shape. No on-chain or subgraph-level primitive yet. No cross-operator routing. No royalty splitting. This is genuinely new construction.

**Settlement — half-built.** x402 facilitator + payment middleware ship today (`client/src/x402/`). ClaimRegistry pays operators for outcomes. **Royalty splits for retrieval do not exist** — when a knowledge-query buys an old envelope, who gets paid (original operator? evaluator? sources cited inside the envelope?) and in what shares is unspecified. The component-level provenance is in the envelope schema; the payout logic is not.

**Reputation & memory — solid foundation.** ReputationRegistry on-chain, `Feedback` entity in subgraph, full operator entity model in `spec/2026-04-27-erc-8004-entity-model-design.md`. The signals exist; surfacing them as buyer-facing trust is layer-4 work, not new on-chain construction.

**Net.** Production, outcome-side demand, and reputation are solid. Verification is partial. Settlement is half-built. Storage gating is plumbed-but-leaking. Discovery, knowledge-query, and royalties are the new construction. Roughly: 60% of the layer-spine exists; the missing 40% is mostly buyer-side wiring, not new on-chain protocol.

---

## 6. Phases

The phasing follows from the dependency order. Storage gating must work before pricing can bite. The retrieval API must exist before knowledge-query has a buyer-side surface. Royalty splits must work before agent-to-agent compounding has correct economics. End state — composable buyer surfaces — sits on top.

**Phase A — Close the leak. Stand up the buyer-side path. (Weeks, not months.)**

The smallest set of changes that makes pricing structurally possible.

- Stop publishing `x402-gated` content to IPFS. Publish manifest + access pointer only; serve content via the existing x402 routes from the operator's node.
- Stand up a buyer-facing retrieval API that wraps subgraph + x402 acquisition: query by predicate → get metadata + quote → pay → receive content.
- Wire `acquire_artifact` MCP tool to the cross-operator path so an agent can pay for content from another operator's node.
- Default new envelopes to gated-at-zero. Forces the path through retrieval-API + x402, even when content is currently free. Prices kick in later by setting `priceUsdc`.
- Subgraph: surface a "purchasable" / "x402-endpoint" face on `Execution` so discovery clients know where to acquire.

Acceptance: an agent (or any buyer) can query the subgraph for envelopes matching a predicate and pay-and-fetch the content from the producing operator. End-to-end on testnet.

**Phase B — Knowledge-query as a first-class primitive. Royalty splits.**

Now that pricing can bite, make the consumer-side primitive structural.

- Define `knowledge-query` as a request shape distinct from `outcome-intent`. Same wallet, same x402 settlement, but a different request schema and quoting flow.
- Add component-level access policy on envelope assembly. Today an envelope is gated as a unit; this lets the price attach to a component (a single source artefact, a reasoning segment, an evaluator note) — the granularity #41 argued for.
- Royalty-split logic: when a knowledge-query settles, pay the original envelope's operator, evaluator, and any cited components' creators in declared shares. Lives off-chain in the retrieval API for v0; later moves on-chain if volume warrants.
- Begin metering knowledge-query usage on-chain (or in subgraph state) so reputation and supply-side incentives can read it.

Acceptance: a buyer issues a knowledge-query, receives a priced bundle of matching envelopes/components, payment splits correctly across the upstream creators on settlement.

**Phase C — The internal loop. Agent-as-buyer SDK and the self-improving harness.**

Now agents inside the network can be buyers in production, not just in MCP demos.

- Promote MCP `search_artifacts` / `acquire_artifact` to a first-class operator SDK that talks to the network retrieval API, pays via the operator's wallet, integrates with restorer phases.
- Wire the **default learning restorer** (`docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`) to consume knowledge-queries during its `Orient` and `Debrief` phases — the spec already calls for "others' run history when accessible," and this is what "accessible" means structurally.
- Ship the harness adapter contract (Claude Code + Pi.dev) per the learner spec §8, with the network retrieval API as a required capability.
- Acceptance test: a learner restorer executes an intent, queries the corpus mid-run for analogous past trajectories, pays the upstream creators, applies what it learned, produces a measurably-better trajectory in its `Improve` phase. The agent-to-agent loop demonstrably compounds.

This is where the harness pattern earns its keep. The default-learning-restorer is not "one specialist impl"; it is **the canonical agent-as-buyer**, the first operator class designed to consume Jinn's market in production. Every other restorer impl that chooses to add a knowledge-query phase becomes a participant in the same loop.

**Phase D — External buyer surfaces. The market becomes legible to people who do not run agents.**

Now the market exists. Make it usable.

- Search engines / retrieval APIs over the agent-execution corpus, accessible from a browser or a lab's data pipeline.
- Bundlers + packagers that subscribe to the firehose, curate datasets, resell with their own pricing.
- Lab-grade access: bulk licensing, custom retention, x402 quoting for high-volume queries.
- Compliance / provenance products for regulated buyers — proof of contamination-free timestamps, provenance audit, EU AI Act alignment.
- ve-JINN demand-direction: buyers lock JINN to bias emissions toward categories they want produced (the demand→supply formation mechanic from #41).

Phase D mostly *is not Jinn* — it is the ecosystem. The protocol provides the primitive layer (verifiable supply, component-level provenance, payment gating, evaluator signals, market pricing) and external builders handle packaging, distribution, search, retrieval, analytics, enterprise access. **Jinn does not become a monolithic data company.** It becomes the trust + pricing substrate around which many data businesses can emerge.

---

## 7. Workstreams and the specs that touch them

Each phase decomposes into a small number of workstreams. These are the obvious named work units; not all of them need new specs, several extend existing ones.

**Phase A workstreams:**

| Workstream | Touches | Spec / plan |
|---|---|---|
| Gate enforcement | `packaging.ts`, IPFS upload path | New short spec; ~1 week of work |
| Retrieval API | `client/src/api/`, new endpoints | New spec, extends discovery path |
| Cross-operator acquire | `client/src/mcp/server.ts`, `client/src/x402/` | Extends `2026-04-23-jinn-execution-envelope-tee-scope.md` access policy |
| Subgraph "purchasable" surface | `subgraph/schema.graphql` | Schema migration, no new spec |
| Default-gated envelope policy | `client/src/restorer/engine/envelope-assembly.ts` | Decision record, not a spec |

**Phase B workstreams:**

| Workstream | Touches | Spec / plan |
|---|---|---|
| Knowledge-query primitive | New module under `client/src/intents/` or sibling | **New canonical spec — biggest design surface in this phase** |
| Component-level access policy | Envelope schema, packaging | Extends `2026-04-27-erc-8004-payload-schema.md` |
| Royalty splits | Settlement layer, possibly new contract | New spec (off-chain v0; on-chain later) |
| Knowledge-query metering | Subgraph + reputation reads | Schema extension |

**Phase C workstreams:**

| Workstream | Touches | Spec / plan |
|---|---|---|
| Agent-as-buyer SDK | MCP server promoted to network-aware | Extends `2026-04-14-client-surface.md` |
| Default learning restorer wiring | `docs/superpowers/plans/2026-04-26-default-learner-*.md` | Existing 4 plans + a new "knowledge-query phase wiring" plan |
| Harness adapter contract | Claude Code + Pi.dev adapters | Per learner spec §8 |
| Internal-loop acceptance test | Cross-operator portfolio.v0 + learner | New conformance test |

**Phase D workstreams (sketched, not committed):**

| Workstream | Notes |
|---|---|
| Bulk lab-access tier | Lives outside the protocol — partner-built |
| ve-JINN emission direction | Tokenomics extension; revisits Phase 1a tokenomics |
| Search / packaging / bundler ecosystem | Open invitation; protocol provides primitives |
| Compliance / provenance products | Regulated-buyer surface; partner-built |

The pattern: most of Phase A is small surgical edits in existing files; Phase B introduces one major new spec (knowledge-query primitive); Phase C is integration + harness work that draws on already-written specs; Phase D is ecosystem.

---

## 8. Why decentralisation is the edge — restated

`THESIS.md` §5 names the four properties: less extractive, more neutral, more composable, more efficient. They compound. Applied to the knowledge market specifically:

**Less extractive** is what makes operators willing to disclose. A platform-owned data marketplace with a take rate eats the operator's margin on every transaction; over time, operators with edge route around it. A protocol whose treasury is the DAO and whose payouts are direct from buyer to creator chain cannot extract — operators bring edge to it precisely because it does not.

**More neutral** is what makes labs willing to buy. A centralised competitor (Scale AI, an OpenAI internal pipeline) is structurally a competitor to half its customers. A neutral protocol is not. Labs that are also competitors of each other can both be buyers of the same Jinn corpus without anti-trust theatre. So can regulators, governments, and the open-source AI ecosystem.

**More composable** is what makes the ecosystem possible without Jinn building it. Component-level provenance + open subgraph + x402 endpoints = anyone can build a search engine, a packager, a vertical bundler, a compliance product on top. The combinatorial frontier is structurally larger than what a closed platform can build itself.

**More efficient** is what makes the unit economics work. The DAO holds governance; once a parameter is set, payouts route directly without departments, managers, or platform overhead. More of every dollar a buyer pays reaches the creator. This compounds against any centralised competitor's margin structure.

These compound. The internal loop adds a fifth, derived advantage: **memory accumulates faster** than in any single shop, because the participants compounding it are larger in number than any one institution can employ.

---

## 9. What this discussion does not decide

This document is the framing artifact. It proposes a vision, names layers, sequences phases, and points at code. It does not commit to:

- The exact schema of the knowledge-query primitive (Phase B spec)
- The on-chain vs off-chain boundary for royalty splits (Phase B spec)
- Whether component-level pricing lives in v0 of Phase B or slides to Phase B.5
- The pricing mechanism (operator-set? market-clearing? auction?) — separate sub-discussion
- The Phase 1b roadmap reshuffle implied by this phasing (separate decision)
- ve-JINN demand-direction mechanics (Phase D, or sooner if pulled forward)

Each of these gets its own spec or its own discussion thread. The vision document only argues that the end-state is the knowledge market, the layers are the seven above, and Phases A–D are the right order.

---

## 10. Asks of the team

Three concrete asks:

1. **Pressure-test the framing.** The end-state (knowledge market with two buyer classes), the two-primitive model (outcome-intent + knowledge-query), the layer spine — push back where the cuts are off.
2. **Validate the code reading.** Especially the "gating-plumbed-but-leaking" claim and the "60% of layer-spine exists" estimate. Anything I missed or got wrong?
3. **Prioritise Phase A vs Phase 1b.** Phase A is small, surgical, and unblocks the biggest structural gap. The question is whether it slots in alongside Phase 1b work or displaces something. That decision lives outside this document but is the immediate operational consequence of agreeing with this framing.

---

## References

- [Discussion #41 — Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41)
- `THESIS.md` — canonical thesis (decentralisation as edge)
- `spec/2026-04-21-agentic-data-substrate.md` — first articulation of Jinn-as-data-substrate; this document collapses that framing into the knowledge-market end-state and adds the internal-loop / agent-as-buyer dimension
- `spec/2026-04-29-thesis.md` — meta-spec promoting `THESIS.md` to canonical
- `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md` — the canonical agent-as-buyer (Phase C)
- `docs/superpowers/specs/2026-04-23-jinn-execution-envelope-tee-scope.md` — envelope, trajectory, access policy
- `docs/superpowers/specs/2026-04-27-erc-8004-entity-model-design.md` — operator + reputation entity model
- `client/src/restorer/engine/packaging.ts:387-460` — the gating leak
- `client/src/x402/{acquire,handler,facilitator}.ts` — payment plumbing
- `client/src/mcp/server.ts:160-230` — agent-as-buyer skeleton (`publish_artifact`, `search_artifacts`, `acquire_artifact`)
- `subgraph/schema.graphql` — discovery substrate

---

*Discussion draft — do not cite as committed direction.*
