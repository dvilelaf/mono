---
updated: 2026-04-23
---

# Anchor query

**Q:** Across all tracked goals, which blocker, if resolved this week, would move the most goal progress per unit effort?

## Why this is the anchor
If the wiki can't answer this well, it's not earning its keep. Every synthesise run should implicitly be optimising for a crisp answer to this question.

## Method
1. Walk `20-synthesis/goals/*.md`.
2. For each goal, take its top-ranked blocker.
3. Score each blocker on:
   - **Magnitude** — how much of the goal does this block? (0–3)
   - **Effort** — cost of the smallest next action. (0–3, inverted)
   - **Evidence strength** — is the blocker well-evidenced? (0–2)
4. Sum. Return the top 1–3 with the action.

## Current answer
_To be populated by the first synthesise run._

Seed guess (no score run yet): **idle-capital-undeployed**. 68 ETH + LDO + $200K are named, effort is "deploy," and the yield gap is quantified. High magnitude, low effort, strong evidence.

Confirm or refute via proper scoring on first synthesise run.
