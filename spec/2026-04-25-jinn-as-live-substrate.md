# Jinn as the Live Cognitive Substrate

> Version: 0.1.0-draft
> Date: 2026-04-25
> Author: Oak
> Status: Strategic thesis — supersedes the artefact-resale framing implied by `2026-04-21-agentic-data-substrate.md`

## TL;DR

Jinn is the live cognitive substrate for outcome fulfilment. Buyers do not contract with operators; they contract with **Jinn**, which intermediates a competition among solvers, has evaluators rank the valid solutions, and settles per a per-intent settlement rule. The unit of value is real-time access to the aggregate, not ownership of any one artefact. The same mechanism handles three pricing regions along an emergence-to-commodity slope: subscription at the emergent end, commission in the middle, attestation at the commodity end.

This thesis dissolves the value-leakage worry that surrounds operator-owned artefact resale: operators cannot disintermediate a buyer relationship they never had, and stale copies of past artefacts are dominated by access to the live substrate.

## 1. Premise

The valuable property of Jinn is not any single (intent, attempt, verdict) tuple. It is the **aggregate**, accessed in real time at the moment of need. Two consequences follow:

- **Currency-of-information matters.** Outcomes worth paying for are time-sensitive: market state, on-chain conditions, current capabilities of evolving tool ecosystems, agent traces against today's APIs. Static datasets decay against the world they describe. A live substrate doesn't.
- **The artefact is the cache, not the product.** Each (intent, attempt, verdict) tuple is a cached thought. The thing being sold — to creators, subscribers, downstream consumers — is connection to the process that keeps producing them.

LLMs are structurally backwards-looking: they freeze at training time. A substrate that re-runs the loop on demand against current world-state is something a frozen model cannot replicate.

## 2. Structural rule: Jinn is the sole requestee

Every request goes to **Jinn**. Buyers do not contract with operators. The protocol — expressed via the router contract — is the counterparty to every intent and the counterparty to every solver. None of the solvers has a contractual relationship with the buyer. None of the buyers has a contractual relationship with a particular solver.

This rule is what makes the value-leakage worry collapse. There is no relationship for an operator to take off-protocol — the protocol *is* the relationship. An operator who DM's an old artefact to a buyer is selling a stale copy of yesterday's thought; the buyer who actually needs current solutions has to keep returning to the rail.

This rule is also what makes the protocol's revenue surface coherent. Jinn captures value at the *commission* of an outcome (front of the pipe) and at the *subscription* to a class of outcomes (gauge-directed emissions), not at any downstream resale event.

## 3. The loop

One mechanism, five steps:

### 3.1 Request

Creator posts an outcome to Jinn. The intent carries:

- A description of the outcome (what should be true).
- A settlement rule (auction shape, winner-selection rule, loser-participation policy).
- An escrowed request fee in the marketplace currency (USDC for the first execution chains).
- Optionally, ve-JINN gauge weight directing emissions toward this intent class.

Settlement-rule examples (per intent kind, not protocol-wide):

- **Best-of-N.** Highest-ranked valid solution wins. Suits emergent classes where quality varies.
- **First-at-or-below-P.** First valid solution at price ≤ P wins. Suits commoditizing classes.
- **Sealed-bid auction.** Solvers commit reservation prices alongside their attempts; protocol clears against verdict + price. CoW-style.
- **All-pay-with-tip.** All valid solvers receive a small participation reward; winner takes the residual. Funds exploration in emergent classes.

### 3.2 Production

Solvers attempt the outcome. Each submits a (plan, evidence) tuple. The protocol — not the buyer — is the counterparty to each. Solvers are paid by the protocol on settlement, not by the buyer directly.

### 3.3 Verdict + ranking

Evaluators do two jobs:

- **Verify** each submitted evidence against the outcome spec: `PASS | FAIL | INDETERMINATE`.
- **Rank** the valid solutions per the intent's settlement rule.

At N=1, the assigned evaluator's ranking is canonical. At N>1, ranking is determined by stake-weighted consensus over evaluator-submitted orderings (commit-reveal to prevent copycat). The N>1 design extends `2026-03-23-jinn-implementation-spec-proposal.md` §8 from verdict-consensus to ranking-consensus.

Evaluators are paid per verdict and per ranking participation. This is settled at the same time as solver payment, from the same escrow.

### 3.4 Settlement

Protocol disburses the escrow:

- **Winning solver(s)** — per settlement rule.
- **Evaluators** — verdict + ranking fees.
- **Treasury** — protocol slice (the Jinn cut).
- **Losing solvers** — optional participation reward where the settlement rule supports it. Set high in emergent classes (funds exploration); zero in commoditized ones (efficient production).

### 3.5 Substrate accumulation

Every attempt — winning and losing — every verdict, the ranking, and the evidence are added to the live substrate. The substrate is what the network *is*.

Two distinct surfaces consume the substrate:

- **Subscribers** query against it in real time. This is the read-side rail. Today most of the protocol surface is write-side; making the read-side first-class is the principal new build implied by this thesis.
- **Solvers** train on it (whether they're an LLM lab fine-tuning, a small operator running heuristics, or anything in between). The substrate is the network's accumulated memory of what has worked.

Note: solvers training on the substrate do not disintermediate the protocol. A trained model is just another solver — better than the previous generation, but participating in the same loop. Labs that want to use Jinn data for training have a structural incentive to plug in as solvers (and to direct ve-JINN gauge weight to keep the substrate producing the data they need), not to extract a static dataset that decays the moment they stop pulling.

## 4. Pricing across the emergence-to-commodity slope

Every intent class has a lifecycle. When it first appears, solutions are sparse, evaluators don't yet know what "good" looks like, and the recipe is unknown. As solvers converge and verdict-variance falls, the means-of-production diffuses. Eventually the recipe is widely known; solver margins thin; pricing approaches marginal cost.

The same mechanism handles all three regions, with different surfaces dominating:

| Region | Verdict-variance | Solver count | Dominant pricing surface | What the buyer is paying for |
|---|---|---|---|---|
| **Emergence** | high | sparse | ve-JINN gauge subscription | live access to the aggregate as it forms |
| **Maturing** | falling | growing | request commission (auction-driven) | competitive production of an outcome |
| **Commodity-with-attestation** | low | many | thin commission + attestation premium | stake-bonded verified production of a known recipe |

### 4.1 Emergence — subscription dominates

The recipe is not yet known; demand-side pricing is inelastic. Subscribers (labs, funds, anyone needing the live signal on this class) lock JINN to direct emissions toward the intent class. Emissions subsidize solver participation while answers are scarce. Treasury captures via the subscription premium.

ve-JINN here is **not just governance**. It is the subscription primitive. Holding ve-JINN gives a participant the ability to direct production capacity toward the capability streams they need.

### 4.2 Maturing — commission dominates

Solvers converge; competition drives prices toward marginal cost; the buyer's willingness-to-pay caps from above. Auction-style settlement rules naturally express the price discovery. Treasury captures via request fee.

### 4.3 Commodity-with-attestation — attestation premium dominates

Even at the commodity end, Jinn still sells something — *attestation*. Don't conflate "commodity" with "Jinn has no role." Chainlink doesn't sell prices; anyone can read prices. They sell *attested prices*, and that's a multi-billion-dollar business on a perfectly commoditized underlying.

The same shape applies here. When the recipe for producing an outcome is widely known, the buyer often still needs a cryptographically-backed, evaluator-verified, stake-bonded attestation that the outcome was produced correctly under the constraints they care about. That's the premium that survives commoditization. Treasury captures via attestation fee.

### 4.4 No explicit switch

Where on the slope an intent class sits is read out of two on-chain signals: gauge weight (subscription pressure) and verdict-variance (recipe maturity). The mechanism is the same throughout; the dominant pricing surface shifts automatically as the substrate learns. The protocol does not need to flag intents as "emergent" vs "commodity" — the gauge is the slope.

This generalises and supersedes the per-domain progression sketched in `2026-03-23-jinn-implementation-spec-proposal.md` §10 ("new → maturing → mature → commodity"): there, progression was framed as a domain-level lifecycle in optional domain-scoped contracts. Here it is the universal shape of every intent class, mediated by gauge + verdict-variance.

## 5. What this removes from the design surface

Several proposals that previously seemed load-bearing are unnecessary under this thesis:

- **Operator-priced x402 with `base × score × reputation × TEE × consensus` formulae.** Operators do not sell directly to buyers. Pricing is set by the intent's settlement rule and the auction dynamics among solvers; no per-artefact pricing oracle is needed. The x402 rail still exists for read-side substrate access, but its price is set by the protocol (subscription tier, attestation fee), not per-operator.
- **Per-artefact royalty streams to evaluators.** Evaluators are paid per verdict + ranking at settlement, from the same escrow as solvers. No need to track downstream resale events.
- **Downstream artefact-resale enforcement (DRM, anti-leak).** Operators can sell stale copies of past artefacts anywhere they like; the protocol's revenue is at the front of the pipe. Static copies decay against the live substrate; the leak is self-defeating.
- **Distinct "data product" vs "execution product" SKUs.** Both fall out of the same mechanism. The "data substrate" (`2026-04-21`) is the read-side of the live substrate; the "execution market" is the write-side. Same protocol.

## 6. What this adds to the design surface

Three new primitives, ordered by scope:

### 6.1 Settlement rule on intents

Each intent carries an explicit settlement rule. Initially three or four canonical shapes (best-of-N, first-at-or-below-P, sealed-bid auction, all-pay-with-tip), implementable in the router contract. Per-intent-kind defaults are reasonable; explicit override is allowed.

### 6.2 Evaluator ranking, not just verdict

Evaluators submit an ordering over valid solutions, not just a binary verdict per solution. At N=1 this is a single ordering; at N>1 it is consensus-resolved (e.g., Borda count or Kemeny aggregation, with stake weights). This extends §8 of the implementation spec from verdict-consensus to ranking-consensus.

### 6.3 Read-side query rail

Today most of the protocol surface is write-side: posting intents, claiming, delivering, evaluating. The substrate is *queryable* but the rail for that is thin (ERC-8004 metadata + subgraph). The thesis requires a first-class **read rail**: subscribers pay (in JINN, in USDC, or via ve-JINN subscription) for live access to the aggregate; the protocol settles the read fee back to the contributors of the queried tuples and to the treasury.

This is the principal new build implied by the thesis. It is not in the Phase 1b roadmap as currently scoped.

### 6.4 ve-JINN reframed as capability-stream subscription

ve-JINN is currently framed as gauge governance — token holders direct emission weights across distribution contracts. The thesis reframes it: ve-JINN is the **subscription primitive for capability streams**. Locking JINN to direct emissions toward an intent class is structurally identical to subscribing to a stream of solutions in that class. The mechanism is the same; the framing matters because it identifies a new constituency (data buyers, labs, hedge funds, anyone needing a live signal) as a structural ve-JINN holder.

## 7. What this rejects

This thesis explicitly rejects two framings that have been on the table:

### 7.1 Reject: operator-owned artefacts sold via per-operator x402

Proposed in `2026-04-21-agentic-data-substrate.md` and elaborated in informal discussion. The model has buyers paying operators directly for x402-gated artefacts, with prices set by some `score × reputation × TEE × consensus` formula and the protocol skimming via fee-switch.

Rejected because:

1. **Leakage is structural.** An operator who owns the artefact can resell it bilaterally at any time. The protocol can refuse to certify the off-protocol copy, but for many buyers (labs that just want training data) that's not load-bearing.
2. **Pricing authority on-chain is dangerous.** Letting evaluator scores set prices creates immediate collusion incentives among evaluators; reputation multipliers compound the attack surface.
3. **Per-artefact economics is the wrong unit.** The valuable thing is the *process* that produces artefacts continuously, not any one artefact. The right unit is access to the process.

### 7.2 Reject: prediction-market layer over restoration strategies

Proposed in `2026-04-21` §"What we'd sell" and parked. Reaffirmed-as-rejected here: solver-vs-solver competition is solved inside the loop via competitive settlement + evaluator ranking. A separate prediction-market layer adds capital requirements and resolution complexity without buying anything that the ranking-consensus mechanism doesn't already provide.

## 8. Relationship to existing specs

This thesis sits above the protocol and implementation specs and informs both:

- **`2026-03-23-jinn-protocol-spec-proposal.md`** — unchanged at the level of the loop (Creation → Restoration → Evaluation → Knowledge). The thesis specialises §2.4 (Knowledge) by making the substrate's read-side a first-class protocol concern, where the protocol spec leaves it as a client concern.
- **`2026-03-23-jinn-implementation-spec-proposal.md`** — extends §8 (Evaluation) with ranking-consensus; reframes §10 (Domain-Specific Contracts) lifecycle as universal slope; introduces a new "Read Rail" component alongside §4.3 (x402).
- **`2026-04-21-agentic-data-substrate.md`** — reframed: the data-substrate framing is reinterpreted as the read-side of the live substrate, not a separate "data product." Tier 1 changes (canonical trajectory schema, multi-attempts, evaluator step-level annotations, durable storage) remain valuable. Tier 2/3 changes are reconsidered against the present thesis. The "v1 verified dataset / v2 specialist models" framing is dropped in favour of subscription-to-stream.
- **`2026-04-23-jinn-eval-doc.md`** (growth) — incorporates the live-substrate framing and the Jinn-as-requestee rule as the headline GTM thesis.

## 9. Open questions

These are the load-bearing decisions the thesis defers but flags:

1. **Read-rail mechanism.** Subscription model (ve-JINN as access right), per-query x402, or hybrid? How are read fees distributed back to substrate contributors vs. treasury?
2. **Settlement-rule taxonomy.** Which canonical shapes are protocol-supported at launch? How many is too many? The router contract has to implement the resolution logic for each.
3. **Ranking-consensus mechanism.** Borda? Kemeny? Stake-weighted Schulze? Each has different attack surfaces. Worth a small focused spec.
4. **Intent-class identifier for gauge.** ve-JINN gauge currently directs emissions to *contracts*. Subscribing to a *capability stream* implies a finer-grained identifier (intent kind, intent-class hash). Define this before re-launching the gauge.
5. **Loser-participation reward funding.** In emergent classes, all valid solvers should receive something; this needs a funding source. Treasury slice, or augmented gauge emissions, or separate exploration-reward channel?
6. **Attestation-fee economics at the commodity end.** What's the floor cost of a Jinn attestation? Has to be cheaper than re-doing the work yourself but expensive enough to fund evaluators reliably.

## 10. What this asks for

Alignment on whether **"Jinn is the live cognitive substrate, and Jinn-as-sole-requestee is the structural rule that makes everything else fall out"** is the framing we want to commit to.

If yes:

1. The growth/intro doc (`2026-04-23-jinn-eval-doc.md`) is updated to lead with this thesis.
2. The Phase 1b roadmap is reviewed against §6 (settlement rule, ranking-consensus, read rail, ve-JINN reframe). Most of the roadmap survives; the read rail is the principal new addition.
3. The data-substrate spec (`2026-04-21`) is reinterpreted as the read-side of this thesis rather than a separate product.

If no, the useful pushback names which load-bearing piece breaks: the structural rule (Jinn-as-requestee), the slope, the read-rail commitment, or the rejection of operator-priced x402.
