---
layer: synthesis
domain: finance
updated: 2026-04-23
---

# Blocker: multi currency conversion

## TL;DR
Need consistent tx-date GBP conversion (not live rate) for accurate monthly totals.

## Blocks goal
[finance-monthly-spend](../goals/finance-monthly-spend.md)

## Evidence
[monthly-spend](../../10-analysis/finance/monthly-spend.md) — 2026-04-28: "No `amount_gbp_equivalent` column — multi-currency transactions (EUR, USD, CHF, HKD) not converted." Monthly totals show GBP-only outflows; non-GBP spending is invisible.

## Smallest next action
Add `amount_gbp_equivalent NUMERIC` column to `transactions`. Populate by calling a historical FX rate API (e.g. Open Exchange Rates or ECB) at the transaction date. Alternatively, derive from Revolut's own CSV export which may include GBP equivalent already.

## What would raise certainty
`amount_gbp_equivalent` populated for all non-GBP transactions. Monthly-spend query updated to `SUM(COALESCE(amount_gbp_equivalent, ABS(amount))) WHERE currency = 'GBP' OR amount_gbp_equivalent IS NOT NULL`.
