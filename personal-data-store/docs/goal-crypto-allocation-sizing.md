---
type: goal
domain: finance
title: Right-size crypto allocation; offramp excess to tradfi
status: open
created: 2026-04-21
---

# Right-size crypto allocation

## The question

How much capital do I actually need on-chain to preserve:

1. Rotation optionality — ability to move into specific crypto positions at the right time, without paying the offramp/onramp cost (KYC friction, exchange withdrawal delays, GBP/USD conversion, tax events).
2. UX benefits — continued familiarity with the stack; keeping wallets, signing flows, and yield venues warm.
3. Any asymmetric-upside positions I want to hold on-chain for tax/structural reasons.

Everything above that number is over-allocated to crypto and should be offramped to tradfi.

## Why this matters now

- The yield-optimiser currently shows several stablecoin positions earning below the tradfi hurdle (risk-free + crypto risk premium). Chasing 50bps inside crypto to solve this is the wrong move when tradfi offers a cleaner risk/return.
- MEXC withdrawal friction (April 2026) is a concrete reminder that CEX custody is not liquid on demand. Exposure to custodial crypto earnings above the minimum useful amount carries hidden friction cost.
- Revolut Instant Access currently ~4% GBP is a hard benchmark. Smart-contract risk + depeg risk + tax overhead has to clear a premium over this.

## Decision variables to pin down

- Minimum rotation budget (USD): how much needs to be on-chain and liquid to act on an opportunity without friction? Ballpark to refine: ___
- Illiquidity budget: what positions do I want to hold multi-year on-chain that shouldn't be offramped regardless (e.g., long-term holdings, privacy-structured, tax-structured)? ___
- Target crypto allocation = rotation + illiquidity + buffer.
- Everything over that → offramp queue, prioritised by (APY gap to hurdle × size).

## Hurdle rates (to validate)

- Stablecoin hurdle: tradfi risk-free (currently ~4% GBP Revolut) + 2% crypto risk premium = 6%
- ETH hurdle: native staking (~3%) + 0.5% LST premium = 3.5%

Calibrate the premium upward if the last 12 months showed more smart-contract or depeg incidents in the protocols held.

## Action items

- [ ] Decide the minimum rotation budget number
- [ ] Decide the illiquidity budget
- [ ] Set `TARGET_CRYPTO_ALLOCATION_USD` env var for yield-optimizer
- [ ] Once set: review any under-hurdle positions; offramp those beyond the allocation target
- [ ] Re-evaluate quarterly (or when tradfi rates move >50bps)

## Metrics to track (already exposed by optimiser post this update)

- `cryptoValue` — total on-chain USD
- `tradfiValue` — total in Revolut / tradfi equivalents
- `underHurdleValue` — on-chain capital earning below its class hurdle
- `stablecoinHurdle`, `ethHurdle` — current thresholds

Goal is met when: cryptoValue ≈ TARGET_CRYPTO_ALLOCATION_USD, and underHurdleValue ≤ a small tolerance (say 5% of crypto allocation).
