---
layer: synthesis
domain: health
updated: 2026-05-03
---

# Blocker: bca history scattered

## TL;DR
4 Randox panels now imported (2024-06, 2024-08, 2025-04, 2025-11) and Apple Health body-composition series (~277 weight, 129 body_fat, 129 lean_body_mass) confirmed present. The data is no longer scattered — it's not yet reconciled into a single timeline in the analysis page.

## Blocks goal
[health-body-composition](../goals/health-body-composition.md)

## Evidence
[body-composition-regression](../../10-analysis/health/body-composition-regression.md) — refreshed 2026-05-03: Randox panels loaded; Apple Health body-comp metrics confirmed in DB; reconciliation into a single timeline pending.

## Smallest next action
Pull `waist_circumference`, `weight`, `bmi`, `body_fat_percentage`, `lean_body_mass` from both `randox` and `apple_health` sources into a single time series in the analysis page. Flag any conflicts where the two sources disagree on the same date.

## What would raise certainty
A unified body-composition table in [body-composition-regression](../../10-analysis/health/body-composition-regression.md) showing all loaded data points across both sources, sorted by date.
