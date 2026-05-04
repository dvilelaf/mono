---
layer: synthesis
domain: health
updated: 2026-05-03
sources:
  - page: ../../10-analysis/health/body-composition-regression.md
---

# Goal: Body composition — reverse Apr–Nov 2025 trunk fat expansion

## Status
Regression confirmed in behaviour data: steps 10,188/day (8% below 11K), gym ~1.5×/wk (below 2× goal) across Apr–Oct 2025. Only loaded body comp data point in window: waist 92cm / 81kg (2025-11-18). 3 earlier Randox panels and Apple Health body-composition series (~277 weight rows, 129 body_fat, 129 lean_body_mass) are now in PDS but not yet pulled into analysis. Strong stalled at 2026-03-31 (33 days idle) — sleep × activity comparison still cannot run.

## Top blockers (ranked)
1. [best-window-unresolved](../blockers/best-window-unresolved.md) — anchor data is now in PDS; the question is to query it, not to import it
2. [bca-history-scattered](../blockers/bca-history-scattered.md) — earlier Randox panels loaded; Apple Health body-comp series present; needs reconciliation into single timeline
3. **Strong export vs lifestyle ambiguity** — 33 days no sessions; binary answer needed before further blockers can be added
4. [leg-volume-untracked](../blockers/leg-volume-untracked.md) — per-exercise volume queryability still unconfirmed

## Next actions
- Pull `waist_circumference`, `weight`, `body_fat_percentage` from Randox + Apple Health into the analysis page; identify "best window"
- Resolve Strong export vs paused-lifting binary
- Resume gym sessions so sleep-vs-activity analysis can run

## Evidence trail
- Analysis: [body-composition-regression](../../10-analysis/health/body-composition-regression.md) — refreshed 2026-05-03
- Analysis: [sleep-vs-activity](../../10-analysis/cross/sleep-vs-activity.md) — refreshed 2026-05-03; blocked on Strong gap
- Processing: [apple-health](../../00-processing/health/apple-health.md), [strong](../../00-processing/health/strong.md), [oura](../../00-processing/health/oura.md)
- Goals source: `documents` row, slug `goals-h2-2026` §Body Composition
