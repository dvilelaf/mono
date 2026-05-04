---
layer: synthesis
domain: health
updated: 2026-05-03
---

# Blocker: best window unresolved

## TL;DR
"Best body composition" window still undefined, but the data to anchor it is now in PDS — 3 earlier Randox panels (2024-06, 2024-08, 2025-04) and Apple Health body-composition series (~277 weight rows, 129 body_fat, 129 lean_body_mass). What's missing is the query, not the data.

## Blocks goal
[health-body-composition](../goals/health-body-composition.md)

## Evidence
[body-composition-regression](../../10-analysis/health/body-composition-regression.md) — refreshed 2026-05-03: earlier Randox panels are loaded but `waist_circumference` for those dates not yet pulled into the analysis page. Apple Health `weight` / `body_fat_percentage` / `lean_body_mass` confirmed present but not summarised by month.

## Smallest next action
Run `SELECT recorded_at::date, metric_type, value FROM health_metrics WHERE source IN ('randox','apple_health') AND metric_type IN ('waist_circumference','weight','body_fat_percentage','lean_body_mass') ORDER BY recorded_at` and identify the month with lowest waist + highest lean_body_mass. Annotate that range as the "best window" in the analysis page.

## What would raise certainty
A defined date range (e.g. "best composition window: 2024-Q2") with the underlying body-comp metrics summarised in [body-composition-regression](../../10-analysis/health/body-composition-regression.md).
