---
layer: analysis
domain: health
updated: 2026-05-04
sources:
  - page: ../../00-processing/health/apple-health.md
  - page: ../../00-processing/health/strong.md
  - page: ../../00-processing/health/oura.md
  - page: ../../00-processing/health/randox.md
---

# Body composition regression (Apr–Nov 2025)

## TL;DR
**Now anchored — 2025-04-01 was the best Randox window (waist 80 cm, weight 79.8 kg, BMI 21.9); by 2025-11-18 waist had returned to 92 cm at near-identical weight (81 kg), implying lean-mass loss + visceral gain.** Steps averaged 10,188/day during the window (8% below 11K goal). Gym frequency averaged ~1.5 sessions/week (below 2×/week goal). Sleep data for Apr–Nov 2025 is still not in PDS — Aura daily summaries start only 2026-04-16. Pre-regression "best composition" question now has a *Randox* anchor; Apple Health BCA series still not pulled in.

## Last refreshed: 2026-05-04

**What changed vs prior refresh (2026-05-03):** Source pages `apple-health.md` and `oura.md` were both refreshed 2026-05-04 (+105K Apple Health rows, +1K Aura rows) but all new rows fall in 2026-04-25 → 2026-05-03 — **outside the Apr–Nov 2025 regression window**, so monthly steps/gym numbers are unchanged. New this refresh: pulled in all 4 Randox panels' waist/weight/BMI series (was just the 2025-11-18 panel). This anchors the "best window" question for the first time — see body composition table below. Closes the Randox-side of [best-window-unresolved](../../20-synthesis/blockers/best-window-unresolved.md); Apple Health body-comp series (weight 277 rows, body_fat_percentage 129, lean_body_mass 129) still not joined in.

### Body composition snapshot (all 4 Randox panels)

| Date | Waist (cm) | Weight (kg) | BMI | Note |
|---|---|---|---|---|
| 2024-06-27 | 86.36 | 82.4 | 22.6 | early baseline |
| 2024-08-05 | **93** | 81.7 | 22.4 | first peak |
| 2025-04-01 | **80** | **79.8** | **21.9** | **best window** |
| 2025-11-18 | **92** | 81.0 | 22.1 | regression confirmed |

**Reading: the regression is in waist circumference and (by inference) body composition, not weight.** Between 2025-04-01 and 2025-11-18, weight rose only 1.2 kg (+1.5%) but waist rose 12 cm (+15%). At ~constant weight, waist gain that large is consistent with lean-mass loss plus visceral / abdominal fat gain — i.e. recomp regression rather than simple weight gain. This matches the gym-frequency shortfall in the same window (~1.5×/wk vs 2× goal) and the ApoB rebound 88 → 113 in [apob-trajectory](apob-trajectory.md). Common driver hypothesis is now stronger.

Apple Health body composition (`weight` 277 rows, `body_fat_percentage` 129 rows, `lean_body_mass` 129 rows) is confirmed present but `weight` ends 2024-06-17 — predates the regression window — so AH cannot directly cross-validate the 2025-04 → 2025-11 move. `body_fat_percentage` and `lean_body_mass` extend to 2026-01-13 and *can* — open question below.

### Steps — regression window (Apr–Nov 2025)

| Metric | Value | Goal |
|---|---|---|
| Avg daily step_count | 10,188 | 11,000+ |
| Days with data | 243 of 244 | — |

Steps were 8% below the 11K daily target throughout the regression window.

### Gym sessions — regression window (Apr–Nov 2025)

| Month | Sessions | Weekly avg |
|---|---|---|
| Apr 2025 | 2 | 0.5 |
| May 2025 | 7 | 1.75 |
| Jun 2025 | 9 | 2.25 |
| Jul 2025 | 7 | 1.75 |
| Aug 2025 | 3 | 0.75 |
| Sep 2025 | 9 | 2.25 |
| Oct 2025 | 5 | 1.25 |
| **Apr–Oct avg** | **6.0/mo** | **~1.5/wk** |

Gym frequency was below 2×/week in most months; Aug and Apr were especially low (3 and 2 sessions). Note: the 2025-04-01 Randox panel (best window) was drawn at the *start* of the regression window, so it reflects the prior period's training, not the Apr–Nov 2025 cadence shown here.

### Sleep — regression window (Apr–Nov 2025)
**Not available.** Aura daily summaries only from 2026-04-16. Apple Health `sleep_analysis_*` ends 2024-07. The 2024-07 → 2026-04-16 sleep gap is unchanged.

## Method
```sql
-- Schema note: metric_type not metric_name; recorded_at not date; source='aura' not 'oura'

-- Step count
SELECT DATE_TRUNC('month', recorded_at) AS month,
       ROUND(AVG(value)::numeric, 0) AS avg_daily_steps,
       COUNT(DISTINCT recorded_at::date) AS days_with_data
FROM health_metrics
WHERE source='apple_health' AND metric_type='step_count'
  AND recorded_at BETWEEN '2025-04-01' AND '2025-11-30'
GROUP BY 1 ORDER BY 1;

-- Gym sessions per month
SELECT DATE_TRUNC('month', started_at) AS month, COUNT(*) AS sessions
FROM workouts WHERE source='strong'
  AND started_at BETWEEN '2025-04-01' AND '2025-11-30'
GROUP BY 1 ORDER BY 1;

-- Body composition (Randox panels — all 4 now in DB)
SELECT recorded_at::date AS date, metric_type, value
FROM health_metrics
WHERE source='randox' AND metric_type IN ('waist_circumference','weight','bmi')
ORDER BY recorded_at, metric_type;

-- Body composition (Apple Health — sparse but present; weight ends 2024-06-17, BFP/LBM extend to 2026-01)
SELECT recorded_at::date, metric_type, value
FROM health_metrics
WHERE source='apple_health' AND metric_type IN ('weight','body_fat_percentage','lean_body_mass','body_mass_index')
ORDER BY recorded_at;
```

## Interpretation framework
Goal states: daily step_count 11K+, gym 2×/week, strong sleep scores. The regression window shows shortfall on steps AND gym frequency. Sleep cannot be assessed yet. Body composition now anchored: 2025-04 was the best Randox window; by 2025-11 waist regressed +12 cm at near-identical weight — implies recomp loss not simple weight gain.

## Open questions
- **Apple Health BCA join:** 129 rows of `body_fat_percentage` and `lean_body_mass` extending to 2026-01-13 are still not pulled into this page. Once joined, can cross-validate the Randox-implied recomp regression and provide intra-window resolution (Randox is 4 panels; AH is monthly-ish).
- Apple Health `weight` series ends 2024-06-17 — why? Manual import gap or device change?
- Sleep data gap: Aura daily summaries only since 2026-04-16. Historical Oura export import path still unresolved despite `ring_configuration` reaching 2024-09-21.
- Diet change: not captured in PDS — infer from restaurant spend in Revolut (uncategorised).
- November 2025 missing from gym data — last session 2025-10-27 per Strong import (Strong now stalled at 2026-03-31, 34 days idle).
- ApoB rebounded 88 → 113 in the same window (see [apob-trajectory](apob-trajectory.md)) and waist regressed +12 cm at constant weight — single-driver hypothesis (training fall-off → muscle loss → visceral gain → ApoB rebound) is now testable but not tested.

## Links up
- blocks goal: [health-body-composition](../../20-synthesis/goals/health-body-composition.md)
