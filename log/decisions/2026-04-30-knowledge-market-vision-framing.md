---
date: 2026-04-30
ship: jinn-mono
mode: design
verb: steer
artifact: spec/2026-04-30-knowledge-market-vision-discussion.md (discussion draft)
captain: ritsukai
operator: jinn-mono/crew/opus (jinn-mono-3lc)
status: in-flight 2026-04-30 — vision sitting; framing iterated in chat
flare_id: null
---

# DR-2026-04-30 — Steer Jinn's vision toward "knowledge market with three-layer cut"

## Context

Task **jinn-mono-3lc** was a Captain-led vision sitting filed at the
2026-04-30 muster, asking three entwined questions:

1. What is Jinn's vision / end-state?
2. Where does the "self-improving harness as a class of solutions"
   pattern sit — under the protocol, alongside it, or as the protocol
   itself?
3. How does the existing default-learning-restorer
   (`docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`
   plus the four `docs/superpowers/plans/2026-04-26-default-learner-*.md`
   plans) fit — narrower piece or canonical embodiment?

The sitting also asked the Crew to scope the artifact: thesis revision,
new product spec, or research lens. Captain decided during the sitting
that the artifact is a **GitHub Discussion draft** following the lineage
of [discussion #41](https://github.com/Jinn-Network/mono/discussions/41)
("Sharpening Jinn's value proposition"), structured as **end-state →
phases → workstreams + related specs**.

The framing went through several iterations during the sitting:

- An initial sketch with "two buyer classes" (external + internal) was
  flattened to a uniform buy primitive (anyone is a buyer; no classes).
- A two-protocol-primitives model (outcome-intent + knowledge-query)
  was proposed, then collapsed by the Captain toward a single
  user-facing request shape with two latency paths.
- That collapse was then sharpened by recognising the cut belongs at
  the **app** layer, not the protocol layer — the protocol genuinely
  has two distinct mechanisms (post-intent and read-corpus); apps may
  unify or split them as a product choice.
- The subgraph was clarified as **infrastructure**, not protocol —
  yielding a three-layer cut: protocol / infrastructure / apps.
- Permission-granting / outcome-execution-on-buyer-resources was
  scoped *out* of this discussion entirely, deliberately.

## Decision

**Steer Jinn's framing toward the knowledge-market vision with a
three-layer cut**, captured in
`spec/2026-04-30-knowledge-market-vision-discussion.md`. The five
load-bearing framing choices ratified during the sitting:

**1. End-state is the knowledge market.** Jinn is "the open verifiable
market for agentic execution knowledge." Anyone with a wallet can buy
knowledge from the corpus. No buyer classes — humans, labs, agents,
end users all use the same primitive. The compounding loop falls out
automatically because the same population that produces trajectories
is also consuming them.

**2. One uniform buy primitive, no classes; loop is producer-consumer
overlap, not service-to-each-other.** Earlier draft separated
"external buyers" from "internal agents" as two classes; an even
earlier framing described agents "doing work for other agents." Both
were wrong. The compounding loop is **not agents serving each other**
— it is operators pulling past trajectories from the corpus to do
*their own* work better, with the corpus building up because the
same set of operators are both the producers and the consumers.

**3. Three layers: protocol / infrastructure / apps.** Jinn splits
cleanly into:
   - **Protocol** — on-chain contracts, envelope/manifest schemas,
     signing/verification rules, tokenomics. Neutral, slow-changing.
     Anyone can post intents at this layer (load-bearing for the
     decentralisation claim).
   - **Infrastructure** — subgraph indexers, storage backends, x402
     facilitators, retrieval APIs. Replaceable, plural, *not*
     load-bearing for decentralisation. Where the gating leak lives.
   - **Apps** — user-facing surfaces. The first product on top is
     the "knowledge marketplace" but multiple apps can coexist.

   Subgraph in particular is **infrastructure**, not protocol — it is
   one canonical indexer over the protocol's public state, replaceable
   by alternatives. Calling it protocol would centralise a piece
   meant to be plural.

**4. Two distinct protocol mechanisms, optional unification at app
layer.** The protocol has two distinct mechanisms: posting an intent
(production path → fresh trajectory commissioned, deferred, bounty-
priced) and reading the corpus (retrieval path → existing trajectories,
immediate, retrieval-priced). They have different freshness, latency,
specificity, and price profiles. Apps may present them as one unified
"ask Jinn for knowledge" surface or as two separate products. **This
is a product choice, not a protocol decision.** The vision draft does
not pre-commit.

**5. The first app on top of Jinn is the agent-discovery surface, and
the compounding loop blocks on it.** The first app is primarily
targeted at agents-in-the-network — operators who need to discover
and consume past trajectories during their own work. Without it, the
compounding loop is a thought experiment; with it, it is operational.
Human-facing knowledge-marketplace UIs come *later*, in Phase C, once
the loop is producing demonstrable compounding value worth exposing.
The default-learning-restorer is the canonical agent-as-buyer, and its
Orient/Debrief wiring is part of Phase B (alongside the SDK), not a
separate phase.

The discussion draft also commits to a four-phase sequencing that
follows from layer dependencies *and* the load-bearing role of the
first app:

- **Phase A** — infrastructure: close the gating leak + promote
  retrieval to network scope. Default new envelopes to gated-at-zero
  so the path is structural before pricing varies.
- **Phase B** — the first app: agent-discovery SDK + royalty-split
  primitives + default-learning-restorer wiring + harness adapter
  contract. **The compounding loop becomes operational here.**
- **Phase C** — human-facing surfaces: knowledge-marketplace UI(s),
  lab-tier access, ve-JINN demand-direction, compliance / provenance
  products. Exposes the loop to people who don't run agents.
- **Phase D** — ecosystem (mostly not Jinn): third-party apps,
  alternative indexers, vertical bundlers, specialist agent
  harnesses other than the default learner.

## Options considered

- **α1 — Knowledge-market end-state with three-layer cut (chosen).**
  Preserves THESIS.md canon, surfaces the agent-to-agent loop as a
  consequence of uniform buy access, and cleanly separates protocol
  (neutral substrate) from infrastructure (operational stack) from
  apps (where UX choices live). Best fit with existing thesis and
  #41 lineage. Operationally it puts the bulk of new construction at
  the app layer, which is the right shape — protocol should be slow
  to change once correct.

- **α2 — Vision-expansion: promote the self-improving harness pattern
  into canonical thesis alongside the protocol.** Would require
  revising THESIS.md to add a third pillar. Rejected because the
  harness pattern is a *class of operators that consume Jinn's
  market*, not a parallel system. Putting it in canon confuses the
  protocol-vs-implementation cut.

- **α3 — Layered positioning: ship a separate "Jinn-powered
  self-improving harness substrate" product surface alongside the
  protocol.** Rejected as premature product proliferation; the same
  substrate is delivered structurally by the knowledge-market frame
  with the three-layer cut.

- **α4 — Two protocol-level primitives (outcome-intent +
  knowledge-query).** Rejected once the protocol/app cut clarified
  that the unification choice belongs at the app layer, not the
  protocol layer. The protocol genuinely has two distinct mechanisms;
  what an app does with them is a product decision.

- **α5 — Two buyer classes (external + internal) with shared
  infrastructure.** Rejected as it obscures the actual point: the
  internal compounding loop is a *consequence* of universal buy
  access, not a separate buyer category requiring separate mechanics.

α1 chosen because it preserves canon (THESIS.md unchanged), lands
the internal-loop bet structurally, and yields a phasing where Phase
A is surgical infrastructure work rather than new construction.

## Charter criterion

**Principle 1 (decentralisation as edge) and Constraint 6 (legibility)**
govern this choice. The three-layer cut makes the decentralisation
thesis operationally concrete: the four properties (less extractive,
more neutral, more composable, more efficient) manifest at specific
layers — extraction at the protocol's settlement primitives,
neutrality at the protocol's open intent posting and infrastructure's
plural indexers, composability at component-level provenance and the
infrastructure-app boundary, efficiency at direct buyer→creator
payment routing. Legibility is served by phasing the work so each
phase has a clean externally-visible deliverable rather than a long
ambiguous build.

## Door type and reversibility

**Two-way, reversible-within-discussion.** This is a framing
decision expressed as a discussion draft, not a code commit, contract
change, or public commitment. Reversal cost is the cost of authoring
a competing discussion draft; the sunk cost of code is zero. The
most likely reversal vectors are:

- A team member arguing the unify-or-split decision should be made
  at the protocol layer rather than left to apps;
- Discovery during Phase A scoping that the gating-leak fix is
  materially larger than "few-day surgical edit";
- A buyer-side discovery that materially changes the assumption
  that all buyers transact through the same primitive.

## Kill criteria

This framing is revisited if any of the following surface:

- Captain or another canon owner concludes during discussion comments
  that the protocol/infrastructure/apps cut is wrong (e.g., subgraph
  *should* be canonised as protocol, or apps *should* unify request
  and query at the protocol level).
- Phase A scoping reveals the gating-leak fix requires a protocol
  change rather than infrastructure-only work.
- A buyer-side discovery in the next 30 days that materially changes
  the buyer-class assumptions (e.g., labs flatly refuse to transact
  in the same market as agents, or the agent-to-agent volume turns
  out to be negligible without further protocol work).
- The Phase 1b roadmap conflicts with Phase A in a way that forces
  a pick rather than coexistence.

## Out of scope

- **Permission-granting / outcome-execution-on-buyer-resources.**
  Deliberately excluded. If it ever enters, it is a separate
  primitive in a separate document. The current vision is a
  knowledge market only; what buyers do with the knowledge they
  acquire is their concern, off-protocol.
- **Phase 1b reshuffle.** This framing implies Phase A wants
  near-term attention; whether it slots alongside Phase 1b or
  displaces a piece of it is a separate operational decision.
- **Royalty-split mechanism design.** Phase B work; gets its own
  spec. On-chain vs off-chain for v0 deferred.
- **Knowledge-marketplace app shape (one surface or two).** Phase B
  product call; not committed here.
- **ve-JINN demand-direction mechanics.** Phase D, possibly pulled
  forward, but not committed here.
- **The exact GitHub Discussion post wording.** The draft at
  `spec/2026-04-30-knowledge-market-vision-discussion.md` is the
  authoritative content; minor editing for the Discussion post is
  Captain's call when posting.

## Cross-references

- **Discussion lineage:** [#41 Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41)
- **Canonical thesis:** `THESIS.md`
- **Substrate framing:** `spec/2026-04-21-agentic-data-substrate.md`
  (collapsed into knowledge-market end-state by this DR; the
  three-layer cut formalises and extends that earlier framing)
- **Default-learning-restorer (Phase C anchor):**
  `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`
- **Code reality references in the draft:**
  - `client/src/restorer/engine/packaging.ts:387-460` — gating leak
  - `client/src/x402/{handler,acquire,facilitator}.ts` — payment
    plumbing
  - `client/src/mcp/server.ts:160-230` — agent-as-buyer skeleton
  - `subgraph/schema.graphql` — canonical indexer (infrastructure)
- **Sitting bead:** jinn-mono-3lc (in-progress; closes when Captain
  ratifies the discussion-post wording).

## Consequences

**Immediate:**

- A discussion draft lives at
  `spec/2026-04-30-knowledge-market-vision-discussion.md` ready for
  Captain to post as a new GitHub Discussion in the lineage of #41.
- The five framing choices above become the working position for any
  subsequent vision/strategy conversations until reversed.

**Mid-term:**

- Phase A workstreams (gate enforcement, network retrieval API
  promotion, subgraph "purchasable" surface, default-gated envelope
  policy) become candidate near-term beads. Whether they're filed
  now depends on Phase 1b interaction, which the Captain decides
  outside this DR.
- Phase B is where the load-bearing new construction sits — the
  agent-discovery SDK is the *first app*, and its design is the
  largest single design surface implied by this DR. A Phase B kickoff
  spec covering SDK design + royalty-split semantics is the natural
  follow-up.
- The `2026-04-21-agentic-data-substrate.md` spec is now subsumed
  by this framing rather than competing with it; future references
  should cite this DR as the active framing and `2026-04-21` as the
  original articulation.

**Follow-up framing work that may be needed:**

- A new canonical spec for the agent-discovery SDK (Phase B —
  the first-app design).
- A new canonical spec for royalty-split semantics (Phase B).
- A second-pass thesis revision to add the producer-consumer overlap
  framing to THESIS.md if the Captain decides the canonical thesis
  would benefit from naming it explicitly. Not committed here.

**Lessons / observations from the sitting:**

- The "self-improving harness as a class of solutions" thread of the
  dispatch resolved cleanly under the knowledge-market frame: the
  harness is *a class of operators that pulls from the corpus to
  improve its own work*, not a parallel product. The
  default-learning-restorer slots in as Phase B's canonical
  demonstration — wired in the same phase as the agent-discovery SDK
  it depends on.
- Voyager / ADAS / Sakana / o-series RL comparison from the dispatch
  did not need a separate research artifact; the structural
  difference is captured in §1 ("the compounding loop") and §7
  (decentralisation as edge) of the discussion draft. Those
  frameworks compound *inside one shop*; Jinn's bet is compounding
  across an open population. No separate positioning map filed.
- The sitting walked the framing through several iterations
  (two-classes → uniform; two-primitives-at-protocol → two-mechanisms-
  at-protocol-with-app-level-unification-as-product-choice;
  subgraph-as-protocol → subgraph-as-infrastructure). The final
  cut was visibly cleaner than any of the intermediate ones. The
  three-layer cut is the load-bearing reframe — it is what makes
  every other piece settle into its right place.
- "Permission-granting" was scoped out deliberately; the sitting
  established that outcome-execution-on-buyer-resources is *not*
  Jinn's surface. This is a major scoping win for the vision and
  removes a whole category of fiduciary/escrow complexity from the
  protocol's claims.
