---
layer: synthesis
domain: cross
updated: 2026-05-03
---

# What changed since last synthesis (2026-04-28 → 2026-05-03)

## Moved since last run
- **Yield goal is now measurable.** APY populated for all 9 positions in the 2026-05-03 snapshot (was NULL across all 27 rows). Annualised yield = **$135,043 USD/yr + £10,795 GBP/yr**; gap to $170K = **~$35K**. ([yield-gap](10-analysis/finance/yield-gap.md))
- **Total deployed (USD subtotal): $3,902,453 → $3,649,366** (−$253K). Coinbase Earn USDC swung $1.146M → $1.25M → $1.146M across snapshots; manual-entry drift, not yield loss.
- **Categorisation backlog grew with import volume.** Tx counts Jan/Feb/Mar/Apr 217/200/207/59 (was 40/51/42/14) but null-category GBP rows (with £50K guard) **6,747 / £2.01M** (was ~£1.8M). ([monthly-spend](10-analysis/finance/monthly-spend.md))
- **ApoB trajectory complete: 4 panels loaded** (was 1). 110 → 119 → 88 → 113 mg/dL across Jun-2024 → Nov-2025. ([apob-trajectory](10-analysis/health/apob-trajectory.md))
- **Aura v2 silent failure resolved.** HRV (7), readiness (9), cardiovascular_age (9), VO2 max (5), heart_rate (13,284) now landing daily.
- **Apple Health continuous heart_rate flowing** — ~626K rows for 2026-04-25 → 2026-05-02 (per minute Avg/Min/Max).

## Anomalies
- **Feb 2026 GBP outflow £58,308** — 3.1× the £19K target; £58,071 of that is null-category, so the spike is unallocated, not yet a confirmed overrun. Investigate before treating as real.
- **Coinbase Earn APY default 3.50% → 4.1%** (DefiLlama feed). +$5K notional yield from APY change alone on the $1.146M position.
- **HRV single-night dip 2026-04-29: 26 vs ~45 mean** (≥40% below neighbours). One-off; flag if it repeats. ([sleep-vs-activity](10-analysis/cross/sleep-vs-activity.md))
- **Strong stalled 33 days** — last session 2026-03-31. Either user paused lifting or export stalled; analysis cannot run either way.

## New data ingested
- 4 ApoB panels (2024-06, 2024-08, 2025-04, 2025-11) plus lp_a (1) and vitamin_d (3) from Randox processing.
- Aura v2 expanded endpoints (cardiovascular_age, readiness contributors, resilience, breathing_disturbance_index, spo2).
- Apple Health per-minute heart_rate (~626K rows, 2026-04-25 → 2026-05-02).
- DefiLlama APY backfill into `yield_positions` (live + manual rows; dedup applied).
- Document hits relevant to EY conversation: CountDeFi tax reports for 2022-23, 2023-24, 2024-25 — first time these surface in synthesis searches. [doc: 2025 Complete Tax Report Oak Tan.pdf], [doc: 2024 Complete Tax Report.pdf].

## Blockers — resolved
- [apy-null-in-db](blockers/apy-null-in-db.md) — APY populated for all 9 positions in 2026-05-03 snapshot.
- [apob-values-not-loaded](blockers/apob-values-not-loaded.md) — 4 ApoB values now in PDS; trajectory analysable.

## Blockers — new / surfaced
- **Feb 2026 spend spike** unresolved — same root cause as [merchant-categorisation-incomplete](blockers/merchant-categorisation-incomplete.md), but now visible as a single high-magnitude month rather than a backlog statistic.
- **Strong-export-or-lifestyle ambiguity** — analysis [sleep-vs-activity](10-analysis/cross/sleep-vs-activity.md) explicitly cannot run; needs a single yes/no from the user before further blockers are added.
- **Coinbase manual-entry drift now visible across 3 snapshots** — strengthens the case for [coinbase-balance-manual](blockers/coinbase-balance-manual.md).
