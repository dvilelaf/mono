---
layer: synthesis
domain: finance
updated: 2026-04-23
---

# Blocker: manual csv refresh

## TL;DR
Revolut, Wise, Amazon all require manual CSV re-export; current data lags reality.

## Blocks goal
[finance-monthly-spend](../goals/finance-monthly-spend.md)

## Evidence
[monthly-spend](../../10-analysis/finance/monthly-spend.md) — 2026-04-28: April has only 14 transactions vs 40–51 in Jan–Mar. Revolut, Wise, and Amazon all require manual CSV export and re-import. Data lags by however long since last manual refresh.

## Smallest next action
Export Revolut CSV for April 2026 now and run the import script. This alone should push April tx count to a normal level and give a preliminary April spend figure.

## What would raise certainty
Wise API (read-only key) claimed and wired to the transactions import — removes one permanent manual dependency. See also [wise-api-unused](wise-api-unused.md).
