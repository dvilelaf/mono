---
layer: analysis
domain: finance
updated: 2026-04-23
sources:
  - page: ../../00-processing/crypto/yield-positions.md
---

# Yield gap — $130K current → $170K target

## TL;DR
$40K/yr gap. Three unused capital buckets named in goals (68 ETH, LDO, $200K on MEXC) are the first candidates. Per-bucket expected contribution should be pre-computed before committing.

## Method
```sql
-- Current annualised
SELECT SUM(annualised_yield_usd) FROM yield_positions WHERE active = true;

-- Idle capital (candidates to deploy)
--   68 ETH   — check wallet containing it
--   LDO      — current USD value × target APY
--   $200K    — MEXC balance (manual confirm)
```

Then model: if each bucket is deployed at APY X, does the total close the gap?

## Interpretation framework
- **Gap closes with just these three**: execute. The idle capital *is* the blocker.
- **Gap doesn't close**: need higher-APY positions or accept lower target.
- **Tax treatment changes economics**: the EY conversation (£26K conservative vs aggressive) is potentially larger than this $40K optimisation.

## Open questions
- Current per-bucket APY candidates. Pull from DeFiLlama for ETH LSTs + stablecoin yield.
- Is the $1.4M Coinbase manual entry in the current $130K figure, or excluded?

## Links up
- blocks goal: [finance-yield-170k](../../20-synthesis/goals/finance-yield-170k.md)
