---
layer: processing
domain: finance
updated: 2026-04-28
sources:
  - table: transactions
    query: SELECT * FROM transactions
---

# Transactions (Revolut, Wise, Amazon)

## TL;DR
**10,943 rows** in transactions as of 2026-04-28. Data restored post-wipe. Coverage: 2011-12-21 to 2026-04-08. Two distinct sources in use: `csv_import` (Revolut + Wise) and `amazon_export`.

## Source breakdown (actual — verified 2026-04-28)
| source | currency | rows | date range |
|---|---|---|---|
| amazon_export | GBP | 738 | 2011-12 to 2026-04 |
| amazon_export | EUR | 14 | 2019-04 to 2023-06 |
| csv_import | GBP | 8,073 | 2017-11 to 2026-04 |
| csv_import | EUR | 1,727 | 2017-11 to 2026-03 |
| csv_import | USD | 336 | 2019-09 to 2026-04 |
| csv_import | HKD | 49 | 2020-01 to 2026-04 |
| csv_import | CHF | 6 | 2021-09 to 2025-01 |

Note: `csv_import` combines Revolut Personal, Revolut Savings, and Wise — no sub-source distinction currently. Wise Business rows not distinguishable by source field alone.

All refreshed **manually via CSV re-export**. Wise has an API that could be used (read-only).

## Actual schema (verified 2026-04-23)
`transactions`: id, account_id, date, description, amount, currency, category, balance_after, source, source_ref, metadata, created_at

## Known gotchas
- Multi-currency — always specify currency when aggregating totals.
- Amazon product-level lines replace the aggregate card tx — if you join naively you will double-count.
- 28-category tagger is rules-based; a long tail remains uncategorised or mis-categorised.

## Relevance to goals
- **£19K/mo target** — monthly spend aggregate is the headline number.
- **Break-even over 3 months** — needs post-cut months isolated (Apr 2026 onward).
- **Merchant categorisation complete** — explicit H2 goal.

## How to query
```sql
SELECT DATE_TRUNC('month', date) AS month,
       SUM(CASE WHEN currency='GBP' THEN amount ELSE 0 END) AS gbp_net
FROM transactions
WHERE date >= '2025-01-01'
GROUP BY 1 ORDER BY 1;
```

## Open questions
- How many transactions remain uncategorised? Now answerable — needs a `WHERE category IS NULL` query.
- Is the merchant review backlog tracked anywhere?
- Revolut Personal CSV on disk (`~/Downloads/account-statement_2017-11-11_2026-04-08*.csv`) — has this been imported, or is the 2026-04-08 cutoff the CSV's last date?
- Wise Business sub-source not distinguishable from Revolut in `csv_import` — intentional?
- Revolut Savings rows present? The 2017-11 start date matches Revolut Personal; savings would be a later sub-account.
