---
layer: synthesis
domain: health
updated: 2026-04-23
sources:
  - page: ../../10-analysis/health/body-composition-regression.md
---

# Goal: Body composition — reverse Apr–Nov 2025 trunk fat expansion

## Status
Context gathered. Window comparison not yet run.

## Top blockers (ranked)
1. [best-window-unresolved](../blockers/best-window-unresolved.md) — need to define the "best composition" window before doing A/B
2. [bca-history-scattered](../blockers/bca-history-scattered.md) — body composition readings source unclear
3. [leg-volume-untracked](../blockers/leg-volume-untracked.md) — leg deficit known, but per-exercise volume not confirmed queryable in Strong

## Next actions
- Run the three-series query in [body-composition-regression.md](../../10-analysis/health/body-composition-regression.md)
- Identify the best-composition window explicitly (date range)
- Confirm Strong per-exercise queryability

## Evidence trail
- Analysis: [body-composition-regression](../../10-analysis/health/body-composition-regression.md), [sleep-vs-activity](../../10-analysis/cross/sleep-vs-activity.md)
- Processing: [apple-health](../../00-processing/health/apple-health.md), [strong](../../00-processing/health/strong.md), [oura](../../00-processing/health/oura.md)
