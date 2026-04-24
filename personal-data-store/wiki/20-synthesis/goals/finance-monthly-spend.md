---
layer: synthesis
domain: finance
updated: 2026-04-23
sources:
  - page: ../../10-analysis/finance/monthly-spend.md
---

# Goal: £19K/mo spending, 3-month break-even

## Status
April 2026 is first post-cut month. Needs query + clean categorisation.

## Top blockers (ranked)
1. [merchant-categorisation-incomplete](../blockers/merchant-categorisation-incomplete.md) — long-tail noise masks the signal
2. [manual-csv-refresh](../blockers/manual-csv-refresh.md) — Revolut, Wise, Amazon all manual; lags behind reality
3. [multi-currency-conversion](../blockers/multi-currency-conversion.md) — need consistent tx-date GBP conversion for accurate monthly totals

## Next actions
- Complete merchant categorisation on remaining uncategorised tx
- Run April 2026 monthly spend query once tx data is current
- Set up Wise API (read-only) to remove one manual source

## Evidence trail
- Analysis: [monthly-spend](../../10-analysis/finance/monthly-spend.md)
- Processing: [transactions](../../00-processing/finance/transactions.md), [goals](../../00-processing/meta/goals.md)
- Goals source: `documents` row, slug `goals-h2-2026` §Spending
