---
date: 2026-04-30
ship: jinn-mono
mode: design
verb: steer
artifact: spec/2026-04-30-knowledge-market-vision-discussion.md (discussion draft)
captain: ritsukai
operator: jinn-mono/crew/opus (jinn-mono-3lc)
status: ratified 2026-04-30 — posted as Discussion #59 (https://github.com/Jinn-Network/mono/discussions/59)
flare_id: null
---

# DR-2026-04-30 — Steer Jinn's vision toward the knowledge-market substrate with a gate-paced roadmap

## Context

Task **jinn-mono-3lc** was a Captain-led vision sitting filed at the
2026-04-30 muster. Three entwined questions:

1. What is Jinn's vision / end-state?
2. Where does the "self-improving harness as a class of solutions"
   pattern sit?
3. How does the existing default-learning-restorer / Claude Code
   learner fit in?

The Captain decided during the sitting that the artifact is a **GitHub
Discussion draft** in the lineage of #41 ("Sharpening Jinn's value
proposition"). During the sitting, Oak posted **discussion #57** (a
unified GTM proposal around the Prediction SolverNet). #57 was reviewed
and folded into the framing — this DR's roadmap reflects the
substrate-side of #57's GTM-side, with both treated as paired sibling
discussions.

The framing went through several iterations:

- Initial sketch with "two buyer classes" (external + internal) was
  flattened to a uniform buy primitive (anyone is a buyer; no classes).
- A two-protocol-primitives model (outcome-intent + knowledge-query)
  was first proposed, then tightened: the protocol genuinely has two
  distinct mechanisms (post-intent and read-corpus) but unification is
  an *app-layer* product choice, not a protocol decision.
- The compounding-loop framing was sharpened from "agents serving each
  other" to "the same population producing the corpus is also reading
  from it" — producer-consumer overlap, not service-to-each-other.
- The subgraph was clarified as **infrastructure**, not protocol —
  yielding the three-layer cut: protocol / infrastructure / apps.
- The first app was reframed from "agent-discovery surface" (which
  overstated its scope, since the subgraph already provides discovery)
  to a **thin convenience library** (`client/src/corpus/`) that bundles
  query + manifest-fetch + selection + x402 acquire + cache into one
  programmatic call.
- **No royalties / no DRM** ratified: single-creator / single-payment
  per envelope. Once a buyer has fetched, content is theirs.
- **Optimistic phase** named: ship with `priceUsdc = 0` default; pricing
  is opt-in, asynchronous, operator-flipped.
- **Plug-in interface** sharpened: full-stack `RestorerImpl` adapter as
  the protocol-level surface; per-layer slots scoped to the *default
  harness implementation*, not the protocol. Two recruitment paths:
  contribute-to-default-harness OR bring-your-own-harness.
- **Phasing reframed gate-paced** (not time-paced) after recognising
  that build durations are unestimated and any time-based commitment
  would be vibes. Hard reversion gates from #57 §5.1 ratified.
- **Default harness named as the campaign's reference implementation**
  (role-language, not flagship-marketing-language).

## Decision

**Steer Jinn's framing toward the knowledge-market substrate vision
with a gate-paced roadmap**, captured in
`spec/2026-04-30-knowledge-market-vision-discussion.md`. Six load-bearing
framing choices ratified during the sitting:

**1. End-state is the knowledge market.** "Jinn is the open knowledge
market that compounds faster than closed labs." Anyone with a wallet
can buy. No buyer classes — humans, labs, agents, end users all use
the same primitive. The compounding loop falls out from the same
population producing the corpus also reading from it.

**2. Three-layer cut: protocol / infrastructure / apps.** Protocol =
neutral substrate (contracts, envelope schemas, signing rules,
tokenomics). Infrastructure = plural operational stack (subgraph
indexers, storage backends, x402 facilitators, retrieval primitives) —
replaceable, *not* load-bearing for decentralisation. Apps =
competitive product surfaces — where margin and business models live.
**Subgraph is infrastructure, not protocol.**

**3. No royalties / no DRM / single-creator-single-payment.** The
protocol takes one payment per fetch; once a buyer has content, what
they do with it (cache, share, resell) is their concern. This collapses
component-level pricing, royalty splits, and DRM-style enforcement off
the roadmap. Reputation is the long-term creator asset, not residuals.

**4. The first app is the corpus library SDK.** A thin convenience
library in `client/src/corpus/` that bundles existing primitives
(subgraph + manifest + x402 + cache) into one programmatic call. **It
is not a new discovery surface** — the subgraph already provides
discovery. The library targets operators-as-buyers reading the corpus
during their own work; UI-shaped apps come later.

**5. Plug-in surface: full-stack adapter primary; per-layer slots
inside the default harness, not at the protocol.** The protocol-level
interface is one full-stack `RestorerImpl` adapter — anyone can ship a
working monolith without refactoring. The default harness implementation
(Claude Code learner) has internal slots — already specced as the
seven-phase pipeline — that get publicly pluggable so external
component-builders can drop refiners / judges / planners in without
forking. Two recruitment paths fall out: *contribute to the default
harness* or *bring your own harness*. This dissolves a structural
disagreement with #57 §3 (which proposed protocol-level component
slots — pushed back as too prescriptive for the builders we want to
attract).

**6. Phasing is gate-paced, not time-paced.** Each sub-phase advances
when its gate trips. Hard reversion gates from #57 §5.1 ratified
(12-week component-side, 26-week product-side).

The discussion draft commits to a four-phase structure:

- **Phase A** — Operational loop + campaign-ready surface:
  - A.1 Loop (corpus library + cache + MCP rewiring + restorer
    integration + gating leak fix + default-gated envelope policy)
  - A.2 Plug-in surface (default harness slots publicly pluggable +
    scaffolding + worked examples for both recruitment paths)
  - A.3 Campaign infrastructure (Polymarket-derived intents auto-posting
    + default harness producing visible forecasts + Brier-vs-Polymarket
    dashboard)
  - A.4 Campaign-launch ready (worked example per layer at warmest
    candidate; recruitment-grade docs; component funnel + operator
    broadcast infrastructure)
- **Phase B** — Trust infrastructure (parallel after A.1 ships):
  - B.1 Verifiability tier activation
  - B.2 Evaluator economics + signal-design research
- **Phase C** — Human-facing surfaces (gated by community formation per
  #57 §1.1 — 15–20 community members):
  - C.1 Flagship marketplace API (the *one* canonical app the team
    ships in-house)
- **Phase D** — Ecosystem (no hard gate; emergent; mostly external
  builders).

Cross-cutting: telemetry / Brier metrics, operator outreach, operator
broadcast, Phase 1a/1b roadmap reconciliation, plus future-discussion
threads for ve-JINN demand-direction and evaluator economics.

## Options considered

- **α1 — Knowledge-market substrate with gate-paced four-phase roadmap
  (chosen).** Preserves THESIS.md canon, lands the producer-consumer
  overlap mechanism, three-layer cut absorbs both code reality and
  Oak's GTM, gate-paced timing avoids unestimated week-counts. Best fit
  with thesis lineage and #57 GTM.

- **α2 — Vision-expansion: promote the self-improving harness pattern
  into canonical thesis alongside the protocol.** Rejected because the
  harness pattern is *a class of operators that pulls from the corpus
  to improve own work*, not a parallel system. Putting it in canon
  confuses the protocol-vs-implementation cut. (THESIS §5b update per
  #57 — naming the producer-consumer overlap mechanism — handles the
  thesis-side acknowledgment cleanly.)

- **α3 — Layered positioning: separate "Jinn-powered self-improving
  harness substrate" product surface alongside the protocol.** Rejected
  as premature product proliferation; the same substrate is delivered
  structurally by the knowledge-market frame with the three-layer cut.

- **α4 — Two protocol-level primitives (outcome-intent +
  knowledge-query).** Rejected once the protocol/app cut clarified that
  unification belongs at the app layer. The protocol genuinely has two
  distinct mechanisms; what an app does with them is a product
  decision.

- **α5 — Two buyer classes (external + internal) with shared
  infrastructure.** Rejected as it obscures the actual point: the
  compounding loop is a *consequence* of universal buy access, not a
  separate buyer category.

- **α6 — Component-level protocol slots (Oak's #57 §3 framing).**
  Rejected: would force builders to refactor their working monoliths
  into our taxonomy. Clean resolution: scope slot architecture to the
  default harness implementation; protocol stays narrow; per-layer
  slots are a default-harness feature, not a protocol commitment.

- **α7 — Royalty / component-level pricing for downstream creators.**
  Rejected (DRM territory). Single-creator / single-payment per
  envelope; reputation is the long-term asset.

- **α8 — Time-paced phasing with week-by-week estimates.** Rejected:
  the build durations are unestimated; pre-committing to weeks would be
  vibes. Gate-paced is honest. (Aligns with #57's gate-paced reversion
  thresholds.)

α1 chosen because it preserves canon, lands the compounding-loop
mechanism structurally, scopes the slot architecture correctly,
matches #57's gate-paced discipline, and yields a roadmap with honest
acceptance criteria rather than fabricated timelines.

## Charter criterion

**Principle 1 (decentralisation as edge) and Constraint 6 (legibility)**
govern this choice. The three-layer cut makes the decentralisation
thesis operationally concrete: the four properties (less extractive,
more neutral, more composable, more efficient) manifest at specific
layers. Apps capture margin on value-add while the protocol takes none —
which is what makes app-layer business models work and is the reason
operators are willing to disclose. Legibility is served by gate-paced
phasing where each phase has clean externally-visible deliverables.

## Door type and reversibility

**Two-way, reversible-within-discussion.** Framing decision expressed
as a discussion draft, not a code commit, contract change, or public
commitment. Reversal cost is the cost of authoring a competing
discussion draft. The most likely reversal vectors are:

- A team member arguing that the corpus library scope is wrong (too
  thin, too thick, wrong home).
- Phase A.1 scoping reveals the gating-leak fix is materially larger
  than expected.
- A buyer-side discovery in the next 30 days that materially changes
  the buyer-class assumptions.
- The Phase 1b roadmap conflicts with Phase A in a way that forces a
  pick rather than coexistence.

## Kill criteria

This framing is revisited if any of the following surface:

- A canon owner concludes the three-layer cut is wrong (e.g., subgraph
  *should* be canonised as protocol; or the protocol/app boundary
  should sit elsewhere).
- The producer-consumer overlap claim turns out to be empirically
  weak — operators don't actually consume meaningfully from the corpus
  in their own work, defeating the loop's structural argument.
- The plug-in surface in Phase A.2 attracts zero external integrations
  within Oak's 12-week threshold (#57 §5.1 component-side reversion).
- The Brier-vs-Polymarket dashboard runs persistently negative + flat
  trend over 26 weeks (#57 §5.1 product-side reversion).
- A buyer-side discovery materially changes the assumption that all
  buyers transact through the same primitive.
- The Phase 1b roadmap conflicts with Phase A in a way that forces a
  pick rather than coexistence.

## Out of scope

- **Permission-granting / outcome-execution-on-buyer-resources.**
  Deliberately excluded. If it ever enters, it is a separate primitive
  in a separate document. The current vision is a knowledge market
  only; what buyers do with the knowledge they acquire is their
  concern, off-protocol.
- **Royalty-split mechanism design.** Off the roadmap entirely. No-DRM
  ratified.
- **Component-level pricing.** Off the roadmap.
- **Phase 1b reshuffle.** Operational, not framing.
- **Knowledge-marketplace app shape (one surface or two).** Phase C
  product call after community gate hits.
- **ve-JINN demand-direction mechanics.** Future discussion lineage.
- **Evaluator economics design.** Phase B research workstream + parallel
  future discussion. Current JINN-emissions model holds for Phase A.
- **Time estimates for Phase A.** Gate-paced; the technical spec
  follow-up does engineering estimation.
- **THESIS.md updates.** Possible §5b addition (per #57) lives in its
  own spec PR.

## Cross-references

- **Discussion lineage:**
  - [#41 Sharpening Jinn's value proposition](https://github.com/Jinn-Network/mono/discussions/41)
  - [#57 Unified GTM around the Prediction SolverNet](https://github.com/Jinn-Network/mono/discussions/57) — sibling
- **Canonical thesis:** `THESIS.md`
- **Substrate framing:** `spec/2026-04-21-agentic-data-substrate.md`
  (subsumed by knowledge-market end-state)
- **Default-learning-restorer (Phase A.2 anchor):**
  `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`
- **Verifiability anchor (Phase B.1):**
  `docs/superpowers/specs/2026-04-23-jinn-execution-envelope-tee-scope.md`
- **Code reality:**
  - `client/src/restorer/engine/packaging.ts:387-460` — gating leak
  - `client/src/x402/{handler,acquire,facilitator}.ts` — payment plumbing
  - `client/src/mcp/server.ts:160-230` — agent-as-buyer skeleton
  - `subgraph/schema.graphql` — canonical indexer (infrastructure)
- **Sitting bead:** jinn-mono-3lc (closed with verb `ship` on
  posting Discussion #59).
- **Posted Discussion:** [#59 — Jinn as the knowledge market — implementation roadmap proposal](https://github.com/Jinn-Network/mono/discussions/59)

## Consequences

**Immediate:**

- A discussion draft lives at
  `spec/2026-04-30-knowledge-market-vision-discussion.md` ready for
  Captain to post as a new GitHub Discussion in the lineage of #41
  and as sibling to #57.
- A pending comment on #57 has been drafted (substantive pushback on
  §3's component-decomposition framing) — Captain ratifies before
  posting.
- The six framing choices above become the working position for any
  subsequent vision/strategy conversations until reversed.

**Mid-term:**

- Phase A becomes a coordinated multi-sub-phase build directly tied
  to #57's campaign launch. The 12-week post-A.4 threshold creates a
  real success criterion (first external integration) for Phase A.
- Phase B runs in parallel after A.1 ships, decoupling from mainnet
  timing (which is community-gated, not feature-gated).
- The default-learning-restorer spec becomes the structural anchor
  for Phase A.2 — its phase pipeline becomes the publicly pluggable
  surface external component-builders ship into.
- The `2026-04-21-agentic-data-substrate.md` spec is subsumed; future
  references should cite this DR as the active framing.

**Follow-up framing work that may be needed:**

- New canonical spec for the corpus library design (Phase A umbrella).
- New canonical spec for the default-harness plug-in surface (Phase A.2).
- New research note + canonical spec for evaluator economics (Phase B.2).
- New canonical spec for the security audit workstream (audit plan +
  tooling shortlist) — drawn up by audit lead, draws on community
  expertise (Alex, Andre); gates mainnet readiness.
- Future discussion thread for ve-JINN demand-direction.
- Possible THESIS.md §5b update per #57 — naming the
  producer-consumer-overlap mechanism explicitly.

**Lessons / observations from the sitting:**

- The "self-improving harness as a class of solutions" thread of the
  dispatch resolved cleanly under the knowledge-market frame: the
  harness is *a class of operators that pulls from the corpus to
  improve its own work*. The Voyager / ADAS / Sakana / o-series
  comparison is a one-paragraph mention, not a structured analysis —
  closed self-improving systems compound inside one shop; Jinn is the
  open substrate where open-source self-improving harnesses can run.
- The Captain caught a process error mid-sitting: the Crew (Opus)
  drafted the full discussion document before walking the framing
  points to alignment. Process correction was applied — paused the
  draft, walked points one-by-one, resumed drafting only after all
  points were settled. The brainstorming skill's "draft after
  alignment, not before" rule is the right discipline.
- The sitting walked through several rejected framings before landing
  on the final cut. The intermediate framings were not wasted — each
  exposed a structural question (buyer classes? primitives at protocol
  vs. app? subgraph as protocol? component decomposition at protocol?
  royalties?). The final cut is sharper precisely because it was
  pressure-tested through those alternatives.
- "Permission-granting" was scoped *out* deliberately. Outcome-
  execution-on-buyer-resources is not Jinn's surface. This is a
  scoping win that removes fiduciary/escrow complexity from the
  protocol's claims.
- "No royalties / no DRM" was a Captain-led ratification mid-sitting
  that dramatically simplified the substrate. Worth being explicit
  in the final framing.
- "Outputs improve as a consequence of pricing knowledge" was a
  Captain-led tightening of the §2 thesis-line treatment. The two
  framings (knowledge-as-priced-asset, outputs-improve-as-consequence)
  are not opposed; they reinforce. Worth landing explicitly because
  readers might otherwise assume "knowledge market" means "we don't
  care about outcomes."
- Security audit of the deployed contract stack added as a cross-
  cutting workstream gating mainnet readiness. Tangential to the
  substrate vision but necessary; the discussion draft would have
  been incomplete without surfacing it. Draws on AI-enabled audit
  tooling and community expertise.
- The relationship to #57: the two discussions are *paired*, not
  competing. This document is the substrate vision; #57 is the GTM.
  The technical spec follow-up #57 asks for sits underneath both.
