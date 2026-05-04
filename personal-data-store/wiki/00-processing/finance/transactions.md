---
layer: processing
domain: finance
updated: 2026-04-23
sources:
  - table: transactions
    query: SELECT * FROM transactions
---

# Transactions (Revolut, Wise, Amazon)

## TL;DR
**0 rows** in transactions as of 2026-04-23 (first verified extract run). Previous count (~10,400) was from user context, not a DB query. CSV imports are manual and have not yet been run against this DB instance.

## Source breakdown (planned — not yet populated)
- **Revolut Personal**: ~8,108 tx, Nov 2017 – present, multi-currency (GBP/EUR/USD/HKD/CHF)
- **Revolut Savings**: ~1,102 tx, Nov 2022 – present (custom parser for different CSV)
- **Wise Business**: ~1,176 tx across GBP/EUR/USD accounts, May 2023 – present
- **Amazon Orders**: ~752 itemised orders Dec 2011 – present, replaces generic "Amazon" card lines with product-level detail

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
- How many transactions remain uncategorised? Needs query (0 rows currently, moot until import).
- Is the merchant review backlog tracked anywhere?
- When will CSV imports be run to populate the DB?
