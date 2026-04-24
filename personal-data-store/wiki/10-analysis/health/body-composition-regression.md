---
layer: analysis
domain: health
updated: 2026-04-23
sources:
  - page: ../../00-processing/health/apple-health.md
  - page: ../../00-processing/health/strong.md
  - page: ../../00-processing/health/oura.md
---

# Body composition regression (Apr–Nov 2025)

## TL;DR
Waist expanded from 80 → 92 cm over Apr–Nov 2025. Goal: reverse. Need to reconstruct what changed across steps, gym frequency, sleep in that window vs the prior best-composition window.

## Method
Three parallel time-series over two windows:

**Window A (best composition):** identify from Apple Health + BCA. Extract steps, gym sessions, sleep score.
**Window B (regression Apr–Nov 2025):** same three series.

```sql
-- Daily step count
SELECT date, value
FROM health_metrics
WHERE source='apple_health' AND metric_name='steps'
  AND date BETWEEN '2025-04-01' AND '2025-11-30';

-- Gym sessions per week
SELECT DATE_TRUNC('week', date) AS wk, COUNT(*)
FROM workouts WHERE source='strong'
  AND date BETWEEN '2025-04-01' AND '2025-11-30'
GROUP BY 1 ORDER BY 1;

-- Oura sleep
SELECT date, value
FROM health_metrics
WHERE source='oura' AND metric_name='sleep_score'
  AND date BETWEEN '2025-04-01' AND '2025-11-30';
```

## Interpretation framework
Goal states: daily steps 11K+, gym 2×/week, strong sleep scores. The regression window should show shortfall on ≥1 of these.

## Open questions
- What defines the "best composition" window? Needs BCA history resolved.
- Was there a diet change in parallel? Not directly captured — ask user or infer from restaurant spend in Revolut.

## Links up
- blocks goal: [health-body-composition](../../20-synthesis/goals/health-body-composition.md)
