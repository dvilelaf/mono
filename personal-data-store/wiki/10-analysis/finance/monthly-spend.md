---
layer: analysis
domain: finance
updated: 2026-04-23
sources:
  - page: ../../00-processing/finance/transactions.md
---

# Monthly spend — is £19K/mo achieved?

## TL;DR
Target is £19K/mo post-cuts. Goal needs 3+ consecutive months at-or-below target to count as break-even. April 2026 is the first candidate.

## Method
```sql
SELECT DATE_TRUNC('month', date) AS month,
       SUM(amount_gbp_equivalent) AS spend_gbp
FROM transactions
WHERE date >= '2026-01-01'
  AND category NOT IN ('income','transfer','yield')
GROUP BY 1 ORDER BY 1;
```

Tag the first post-cut month (April 2026) explicitly and compare.

## Caveats
- Long-tail miscategorisation likely inflates noise. See transactions.md open questions.
- Multi-currency: need consistent GBP conversion at tx date, not live rate.
- Amazon product-level rows vs aggregate — confirm no double counting.

## Interpretation framework
- **≤£19K for 3 consecutive months (Apr/May/Jun 2026)**: goal met.
- **One-month overrun with explainable cause**: note and continue.
- **Persistent overrun**: find top 5 overrun categories, iterate cuts.

## Open questions
- What's the actual April 2026 number? Needs query + clean data.
- Are Change Agent contract payments and OLAS salary correctly classified as income?

## Links up
- blocks goal: [finance-monthly-spend](../../20-synthesis/goals/finance-monthly-spend.md)
