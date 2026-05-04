---
layer: analysis
domain: finance
updated: 2026-04-28
sources:
  - page: ../../00-processing/finance/transactions.md
---

# Monthly spend — is £19K/mo achieved?

## TL;DR
**Data quality insufficient for verdict.** De-duplicated GBP outflows (excluding large transfers) are well below £19K/mo, but most transactions remain uncategorised and April data is incomplete. Reliable verdict requires categorisation of the null-category backlog first.

## Last refreshed: 2026-04-28

| Month | De-duped GBP outflows | Tx count | vs £19K target |
|---|---|---|---|
| Jan 2026 | £5,124 | 40 | ? (categorisation incomplete) |
| Feb 2026 | £6,614 | 51 | ? (categorisation incomplete) |
| Mar 2026 | £8,165 | 42 | ? (categorisation incomplete) |
| Apr 2026 | £414 | 14 | Incomplete (month not closed) |

**Warning — known data issues:**
1. **Duplicate transactions confirmed**: multiple rows exist for the same transaction (same date/description/amount). De-duplication with `DISTINCT ON (date, description, amount, currency)` applied above.
2. **No `amount_gbp_equivalent` column** — multi-currency transactions (EUR, USD, CHF, HKD) not converted. GBP-only outflows shown above.
3. **~£1.8M in null-category GBP transactions**: these include large transfers and likely legitimate spending. Excluded from the table above via `ABS(amount) < £50K` guard. Without categorisation the headline figure is unreliable.
4. **April data incomplete**: only 14 transactions logged vs 40–51 in Jan–Mar.

## Method
```sql
-- Schema note: no amount_gbp_equivalent column; use amount + currency
-- De-duplicate first to avoid double-counting
SELECT DATE_TRUNC('month', date) AS month,
       ROUND(SUM(ABS(amount))::numeric, 0) AS spend_gbp,
       COUNT(*) AS tx_count
FROM (
  SELECT DISTINCT ON (date, description, amount, currency) date, description, amount, currency, category
  FROM transactions
  WHERE date >= '2026-01-01' AND currency = 'GBP' AND amount < 0
    AND (category IS NULL OR category NOT IN ('income','transfer','yield'))
    AND ABS(amount) < 50000
  ORDER BY date, description, amount, currency
) deduped
GROUP BY 1 ORDER BY 1;
```

## Caveats
- Long-tail miscategorisation inflates noise substantially. See transactions.md.
- Multi-currency: need consistent GBP conversion at transaction date, not live rate.
- April figure will grow as transactions are imported through month-end.

## Interpretation framework
- **≤£19K for 3 consecutive months (Apr/May/Jun 2026)**: goal met.
- **One-month overrun with explainable cause**: note and continue.
- **Persistent overrun**: find top 5 overrun categories, iterate cuts.

## Open questions
- Categorisation backlog: how many of the ~£1.8M in null-category rows are spending vs transfers?
- Are Change Agent contract payments and OLAS salary correctly classified as `income`?
- Multi-currency conversion: build consistent GBP rate at transaction date.

## Links up
- blocks goal: [finance-monthly-spend](../../20-synthesis/goals/finance-monthly-spend.md)
