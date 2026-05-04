---
layer: synthesis
domain: finance
updated: 2026-05-03
sources:
  - page: ../../10-analysis/finance/yield-gap.md
---

# Goal: $170K annualised yield by July 2026

## Status
APY now populated for all 9 positions (snapshot 2026-05-03). Annualised yield: **$135,043 USD/yr + £10,795 GBP/yr**. Total deployed: **$3,649,366 USD + £254K GBP**. Gap to $170K USD target: **~$35K**. 68 ETH, LDO, $200K MEXC still not visible as positions. Deadline: July 2026 — 9 weeks away.

## Top blockers (ranked)
1. [idle-capital-undeployed](../blockers/idle-capital-undeployed.md) — 68 ETH / LDO / $200K MEXC; deploying these closes the gap with margin
2. [ey-tax-conversation-unresolved](../blockers/ey-tax-conversation-unresolved.md) — £26K conservative-vs-aggressive swing; comparable to the nominal yield gap
3. [coinbase-balance-manual](../blockers/coinbase-balance-manual.md) — Coinbase position swung $1.146M → $1.25M → $1.146M across 3 snapshots; manual entry hides drift

## Next actions
- Confirm wallet/exchange location of 68 ETH, LDO, $200K MEXC; deploy each to highest-confidence yield surface
- Send the 3 CountDeFi tax reports to EY ahead of a focused call on rebasing/auto-compounding treatment
- Investigate Coinbase Advanced Trade API path to read Earn balances; until then, schedule a weekly manual refresh

## Evidence trail
- Analysis: [yield-gap](../../10-analysis/finance/yield-gap.md) — refreshed 2026-05-03
- Processing: [yield-positions](../../00-processing/crypto/yield-positions.md), [goals](../../00-processing/meta/goals.md)
- Goals source: `documents` row, slug `goals-h2-2026` §Yield & Income
