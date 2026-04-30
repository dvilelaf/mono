---
date: 2026-04-30
ship: jinn-mono
mode: design
verb: steer
artifact: spec/2026-04-30-knowledge-market-vision-discussion.md (discussion draft)
captain: ritsukai
operator: jinn-mono/crew/opus (jinn-mono-3lc)
status: ratified 2026-04-30 — vision sitting; framing chosen over alternatives
flare_id: null
---

# DR-2026-04-30 — Steer Jinn's vision toward "knowledge market with internal + external buyer classes"

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

## Decision

**Steer Jinn's framing toward the knowledge-market vision** as captured
in `spec/2026-04-30-knowledge-market-vision-discussion.md`. The four
load-bearing framing choices ratified during the sitting:

**1. End-state is the knowledge market, not the harness substrate.**
Jinn is "the open verifiable market for agentic execution knowledge."
The protocol is canonical; the self-improving harness is a *class of
solutions that runs on Jinn*, not a parallel product surface. This
preserves THESIS.md as canonical and answers thread (2) of the dispatch:
the harness pattern stays underneath the protocol.

**2. One market, any buyer class.** External buyers (labs, vertical AI
companies, regulated enterprises, end users) and internal buyers (agents
within the network learning from each other) transact on the *same*
market substrate — same envelopes, same gating, same x402 rails, same
evaluator scores, same reputation. They differ only in consumption
pattern and price elasticity, not in mechanism. This unifies #41's
external-data-substrate framing with the agent-to-agent compounding loop
the Captain emphasised.

**3. Two demand-side primitives with deep symmetry.** Outcome-intent
(producer-side: "do this work, deliver this outcome" — today's
`JinnRouter` flow) and knowledge-query (consumer-side: "find/retrieve
existing trajectories matching predicate P" — new). They share supply,
storage, settlement rails, and trust signals; they diverge only at the
demand layer. The internal agent-to-agent loop *requires* the
knowledge-query primitive — outcome-intent latency and operator margin
break the economics of mid-execution lookups.

**4. Default-learning-restorer is the canonical agent-as-buyer.** Its
Orient and Debrief phases are the natural consumption points for
knowledge-query. It is not "one specialist impl"; it is the prototype
that makes the internal loop economically real. Phase C of the
sequencing is "wire the learner to the network retrieval API."

The discussion draft also commits to a seven-layer architecture (Production,
Verification & quality, Gated storage, Discovery & retrieval, Demand,
Settlement & royalties, Reputation & memory) and a four-phase sequencing
(A: close the gating leak + buyer-side path; B: knowledge-query primitive
+ royalty splits; C: agent-as-buyer SDK + learner wiring; D: external
ecosystem surfaces). These follow from the framing above and are the
operational consequences of accepting it.

## Options considered

- **α1 — Knowledge-market end-state, harness underneath (chosen).**
  Preserves THESIS.md canon, handles the internal-loop dimension via the
  same market with two buyer classes, makes the harness pattern legible
  as a class of operators rather than a separate product. Best fit with
  existing thesis and #41 lineage.

- **α2 — Vision-expansion: promote the self-improving harness pattern
  into canonical thesis alongside the protocol.** Would require revising
  THESIS.md to add a third pillar ("Jinn is the open substrate for self-
  improving agent harnesses"). Rejected because the harness pattern is
  a *consumer* of Jinn's market, not a parallel system. Putting it in
  canon confuses the protocol-vs-implementation cut.

- **α3 — Layered positioning: protocol stays canonical; ship a separate
  "Jinn-powered self-improving harness substrate" product surface
  ("Kubernetes for self-improving agents").** Rejected as premature
  product proliferation; the same substrate is delivered structurally
  by the knowledge-market frame without inventing a second brand.

- **α4 — One primitive (Oak's framing in #41 thread): collapse
  knowledge-query into outcome-intent semantically.** Rejected as a
  user-experience mistake even though the abstraction is correct in the
  limit. Operator margin and async latency on every lookup break the
  internal loop, which is the load-bearing distinctive feature.

α1 chosen because it preserves canon (THESIS.md unchanged), lands the
internal-loop bet structurally rather than as a brand pivot, and yields
a phasing where most of Phase A is surgical edits rather than new
construction.

## Charter criterion

**Principle 1 (decentralisation as edge) and Constraint 6 (legibility)**
govern this choice. The knowledge-market framing makes the
decentralisation thesis operationally concrete: the four properties
(less extractive, more neutral, more composable, more efficient)
manifest at specific layers — extraction at settlement, neutrality at
the access layer, composability at component-level provenance,
efficiency at direct buyer→creator payment. Legibility is served by
phasing the work so each phase has a clean externally-visible
deliverable rather than a long ambiguous build.

## Door type and reversibility

**Two-way, reversible-within-discussion.** This is a framing decision
expressed as a discussion draft, not a code commit, contract change, or
public commitment. Reversal cost is the cost of authoring a competing
discussion draft; the sunk cost of code is zero. The most likely
reversal vector is Oak (or another team member) arguing the
one-primitive collapse should hold for v0 or that the layered-
positioning option (α3) is worth the brand spend.

## Kill criteria

This framing is revisited if any of the following surface:

- Captain or another canon owner concludes during discussion comments
  that the two-primitive model is over-engineering for v0 and that
  knowledge-query should be subsumed into outcome-intent until volume
  warrants splitting.
- Phase A scoping reveals the gating-leak fix is materially larger than
  "few-day surgical edit" — would force re-sequencing.
- A buyer-side discovery in the next 30 days that materially changes
  the buyer-class assumptions (e.g., labs flatly refuse to transact in
  the same market as agents, or the agent-to-agent volume turns out to
  be negligible).
- The Phase 1b roadmap conflicts with Phase A in a way that forces a
  pick rather than coexistence.

## Out of scope

- **Phase 1b reshuffle.** This framing implies Phase A wants near-term
  attention; whether it slots alongside Phase 1b or displaces a piece
  of it is a separate operational decision (see "Asks of the team" §10
  of the discussion draft).
- **Knowledge-query schema design.** Phase B work; gets its own spec.
- **Royalty-split mechanism design.** Phase B work; gets its own spec.
  On-chain vs off-chain for v0 deferred.
- **ve-JINN demand-direction mechanics.** Phase D, possibly pulled
  forward, but not committed here.
- **The exact GitHub Discussion post wording.** The draft at
  `spec/2026-04-30-knowledge-market-vision-discussion.md` is the
  authoritative content; minor editing for the Discussion post itself
  (tone, framing of the asks, removal of internal references) is
  Captain's call when posting.

## Cross-references

- **Discussion lineage:** [#41 Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41)
- **Canonical thesis:** `THESIS.md`
- **Substrate framing:** `spec/2026-04-21-agentic-data-substrate.md`
  (collapsed into knowledge-market end-state by this DR)
- **Default-learning-restorer (Phase C anchor):**
  `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`
- **Code reality references in the draft:**
  - `client/src/restorer/engine/packaging.ts:387-460` — gating leak
  - `client/src/x402/{handler,acquire,facilitator}.ts` — payment plumbing
  - `client/src/mcp/server.ts:160-230` — agent-as-buyer skeleton
  - `subgraph/schema.graphql` — discovery substrate
- **Sitting bead:** jinn-mono-3lc (closed by this DR with verb steer).

## Consequences

**Immediate:**

- A discussion draft lives at
  `spec/2026-04-30-knowledge-market-vision-discussion.md` ready for
  Captain to post as a new GitHub Discussion in the lineage of #41.
- The four framing choices above become the working position for any
  subsequent vision/strategy conversations until reversed.

**Mid-term:**

- Phase A workstreams (gate enforcement, retrieval API, cross-operator
  acquire, subgraph "purchasable" surface, default-gated envelope policy)
  become candidate near-term beads. Whether they're filed now depends on
  Phase 1b interaction, which the Captain decides outside this DR.
- The `2026-04-21-agentic-data-substrate.md` spec is now subsumed by
  this framing rather than competing with it; future references should
  cite this DR as the active framing and `2026-04-21` as the original
  articulation.

**Follow-up framing work that may be needed:**

- A new canonical spec for the knowledge-query primitive (Phase B,
  but the schema thinking can begin earlier).
- A second-pass thesis revision to add the internal-loop language
  to THESIS.md if the Captain decides the canonical thesis would
  benefit from naming agent-to-agent compounding explicitly.
  Not committed here.

**Lessons / observations from the sitting:**

- The "self-improving harness as a class of solutions" thread of the
  dispatch resolved cleanly under the knowledge-market frame: the
  harness is *a class of operators* (agents that consume the corpus
  during execution to compound), not a parallel product. The default-
  learning-restorer slots in as Phase C's canonical demonstration.
- Voyager / ADAS / Sakana / o-series RL comparison from the dispatch
  did not need a separate research artifact; the structural difference
  is captured in §1 ("the internal loop") and §8 (decentralisation as
  edge) of the discussion draft. Those frameworks compound *inside one
  shop*; Jinn's bet is compounding across an open population. No
  separate positioning map filed.
