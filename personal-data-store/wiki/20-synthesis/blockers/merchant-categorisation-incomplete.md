---
layer: synthesis
domain: finance
updated: 2026-05-03
---

# Blocker: merchant categorisation incomplete

## TL;DR
Now visible as the Feb 2026 spike: GBP outflow £58,308 vs £19K target — but £58,071 (99.6%) is null-category, so the overrun is unallocated, not yet adjudicable. Backlog: 6,747 rows / **£2.01M** under the £50K guard.

## Blocks goal
[finance-monthly-spend](../goals/finance-monthly-spend.md)

## Evidence
[monthly-spend](../../10-analysis/finance/monthly-spend.md) — refreshed 2026-04-28; data freshness checked 2026-05-03. Direct query: `SELECT COUNT(*), SUM(ABS(amount)) FROM transactions WHERE category IS NULL AND currency='GBP' AND amount<0 AND ABS(amount)<50000` returns 6,747 / £2,012,729. Feb 2026 query (same filters): £58,071 in 200 null-category rows.

## Smallest next action
Run: `SELECT description, ABS(amount) AS amount, COUNT(*) FROM transactions WHERE currency='GBP' AND category IS NULL AND amount < 0 AND ABS(amount) < 50000 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 50`. Categorise the top-50 merchants by frequency — this will cover the majority of transaction volume.

## What would raise certainty
`SELECT COUNT(*) FROM transactions WHERE category IS NULL AND currency='GBP' AND amount < 0` returns zero (or near-zero). Then Jan–Mar monthly totals are reliable and Apr–Jun proof window can begin.
