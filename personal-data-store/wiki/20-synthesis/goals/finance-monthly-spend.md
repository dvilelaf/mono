---
layer: synthesis
domain: finance
updated: 2026-05-03
sources:
  - page: ../../10-analysis/finance/monthly-spend.md
---

# Goal: £19K/mo spending, 3-month break-even

## Status
**Feb 2026 GBP outflow £58,308 — 3.1× target — but 99.6% null-category, so not yet adjudicable.** Jan £26,916 / Mar £17,956 / Apr £13,771 (incomplete). Tx counts now 217 / 200 / 207 / 59 (vs 40/51/42/14 last cycle — major import progress). Null-category GBP backlog: 6,747 rows / **£2.01M** with the £50K guard. 3-month break-even window (Apr–Jun 2026) cannot be called until categorisation closes.

## Top blockers (ranked)
1. [merchant-categorisation-incomplete](../blockers/merchant-categorisation-incomplete.md) — Feb 2026 spike is the visible symptom; £2.01M unallocated until top-50 merchants are categorised
2. [manual-csv-refresh](../blockers/manual-csv-refresh.md) — April still incomplete (59 tx vs 200+ typical); Revolut/Wise/Amazon all manual
3. [multi-currency-conversion](../blockers/multi-currency-conversion.md) — no `amount_gbp_equivalent`; non-GBP spend invisible

## Next actions
- Categorise top-50 null-category GBP merchants by frequency (one sitting, ~2h)
- Re-export Revolut CSV for April 2026 to bring the month to a normal tx count
- Add `amount_gbp_equivalent` column with historical FX rates

## Evidence trail
- Analysis: [monthly-spend](../../10-analysis/finance/monthly-spend.md) — refreshed 2026-04-28 (data freshness checked 2026-05-03)
- Processing: [transactions](../../00-processing/finance/transactions.md), [goals](../../00-processing/meta/goals.md)
- Goals source: `documents` row, slug `goals-h2-2026` §Spending
