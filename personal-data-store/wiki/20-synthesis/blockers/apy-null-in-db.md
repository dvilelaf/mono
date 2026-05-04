---
layer: synthesis
domain: finance
updated: 2026-05-03
status: resolved
---

# Blocker: APY null in DB — RESOLVED 2026-05-03

## TL;DR
**Resolved.** DefiLlama APY connector landed; `apy` populated for all 9 positions in 2026-05-03 snapshot. Annualised yield now measurable: $135,043 USD/yr + £10,795 GBP/yr.

## Blocked goal
[finance-yield-170k](../goals/finance-yield-170k.md)

## Resolution
Per [yield-gap](../../10-analysis/finance/yield-gap.md) refreshed 2026-05-03: APY populated for all 9 positions. `SELECT COUNT(*) FROM yield_positions WHERE apy IS NOT NULL AND snapshot_at = (SELECT MAX(snapshot_at) FROM yield_positions)` = 9. Coinbase Earn APY now 4.10% via DefiLlama feed (was manual default 3.50%).

## Residual risks
- Earlier snapshots (2026-04-24 → 2026-05-01) still NULL — no historical APY trend yet.
- Coinbase APY pulled from DefiLlama feed; verify against actual Coinbase Earn UI quarterly.
