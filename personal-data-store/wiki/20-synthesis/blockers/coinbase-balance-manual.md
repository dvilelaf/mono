---
layer: synthesis
domain: finance
updated: 2026-05-03
---

# Blocker: coinbase balance manual

## TL;DR
Coinbase Earn position swung **$1.146M → $1.25M → $1.146M** across the 2026-04-27, 2026-05-02 and 2026-05-03 snapshots. Manual entry hides drift; APY now sourced from DefiLlama (4.10%) but value remains hand-entered.

## Blocks goal
[finance-yield-170k](../goals/finance-yield-170k.md)

## Evidence
[yield-gap](../../10-analysis/finance/yield-gap.md) — refreshed 2026-05-03. Coinbase Earn (USDC) is the largest single position ($1,146,000 / 31% of USD subtotal). Value moves only when manually refreshed; the $104K up/down swing across consecutive snapshots is a manual-refresh artefact, not actual yield drift.

## Smallest next action
Investigate Coinbase Advanced Trade API path to read Earn balances programmatically. If reachable, add to the snapshot job. If not, codify a weekly manual refresh on a fixed day to bound drift.

## What would raise certainty
Either (a) automated balance read in the snapshot job, or (b) consecutive weekly snapshots showing only sub-1% delta from manual refresh (consistent with 4.10% APY accrual), proving the manual cadence is sufficient.
