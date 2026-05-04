---
layer: analysis
domain: cross
updated: 2026-05-04
sources:
  - page: ../../00-processing/health/oura.md
  - page: ../../00-processing/health/apple-health.md
  - page: ../../00-processing/health/strong.md
---

# Sleep × activity — does training affect sleep?

## TL;DR
**Strong × sleep test still has zero overlap, but Aura is now logging its own workouts (21 sessions) — a parallel test path is unblocked.** Aura sleep extends 2026-04-17 → 2026-05-03 (17 records); Strong remains stalled at 2026-03-31 (59 sessions, **34 days idle**). Aura workouts (21) all sit inside the sleep window, so HRV/sleep-vs-Aura-workout becomes runnable for the first time. Expanded Oura v2 metrics (HRV 8, readiness 9, cardiovascular_age 9, VO2 max 5, continuous heart_rate 13,673) all flowing per [oura.md](../../00-processing/health/oura.md) refresh 2026-05-04.

## Last refreshed: 2026-05-04

| Metric | Result | Coverage |
|---|---|---|
| Aura sleep_score | 17 records, latest 84 (2026-05-03) | 2026-04-17 – 2026-05-03 |
| Aura sleep_hrv_avg | 8 records | 2026-04-25 – 2026-05-02 |
| Aura cardiovascular_age | 9 records, value 34–37 | 2026-04-25 – 2026-05-03 |
| Aura readiness_score | 9 records | 2026-04-25 – 2026-05-03 |
| Aura workouts | 21 sessions | 2026-04-25 – 2026-05-03 |
| Strong gym sessions | 59 sessions, last 2026-03-31 | 2025-03-13 – 2026-03-31 |
| Date overlap (Strong × Aura sleep) | **None** | Strong ends 2026-03-31; sleep starts 2026-04-17 |
| Apple Health step_count | avg 10,188/day (regression window) | 2015-04 – 2026-05-03 |

**Finding: Strong-vs-sleep still blocked, but Aura-workouts-vs-sleep is now runnable.** Aura's own workouts table (21 sessions, 2026-04-25 → 2026-05-03) sits entirely inside the sleep window. This bypasses the Strong stall (34 days at 2026-03-31) for any "did I train today → how did I sleep" question. Strong remains the better strength-load proxy; Aura workouts (likely walks / activity sessions) are a coarser test but available now.

**Sleep score recent series (Apr 17 → May 3, 17 nights):** 92, 78, 89, 94, 89, 79, 92, 91, 90, 85, 90, 92, 86, 87, 90, 84, 84. Mean ~88, range 78–94 — consistent with "strong sleep score" goal. The two 84s on 2026-05-02 / 2026-05-03 are the lowest of the past week.

**HRV (sleep_hrv_avg, Apr 25 → May 2):** 42, 35, 53, 59, 26, 63, 43, 53. Mean ~47, range 26–63. The 26 outlier on 2026-04-29 still wants explanation (single-night dip of 30+ points vs neighbours).

**What changed vs prior refresh (2026-05-03):**
- Aura: +1 sleep_score (2026-05-03 = 84), +1 sleep_hrv_avg (2026-05-02 = 53), +1 readiness, +1 cardiovascular_age, +5 workouts (16 → 21).
- Strong: unchanged. 34 days idle (was 33).
- Apple Health: continuous-HR feed advanced to 242,044 rows per channel (was 208,667) per [apple-health.md](../../00-processing/health/apple-health.md) refresh 2026-05-04. Doesn't change daily aggregates.

## Method
Join daily: step_count (apple_health) + sleep_score (aura) + gym_session_flag (strong **or** aura workouts). Compute:
- Mean sleep score on training days vs rest days
- Correlation of step count with next-night sleep score
- Effect of intense lift days on HRV (Strong needed) **or** activity sessions on HRV (Aura available now)

```sql
-- Schema note: metric_type not metric_name; recorded_at not date; source='aura' not 'oura'
-- Use aura workouts as the available training proxy until Strong recovers
WITH train_days AS (
  SELECT DISTINCT started_at::date AS date FROM workouts WHERE source IN ('strong','aura')
),
daily AS (
  SELECT
    hm.recorded_at::date AS date,
    hm.value AS sleep_score,
    (t.date IS NOT NULL) AS is_train_day
  FROM health_metrics hm
  LEFT JOIN train_days t ON t.date = hm.recorded_at::date
  WHERE hm.source = 'aura' AND hm.metric_type = 'sleep_score'
    AND hm.recorded_at >= '2026-04-17'
)
SELECT is_train_day, COUNT(*) AS n, ROUND(AVG(sleep_score)::numeric,1) AS avg_sleep
FROM daily GROUP BY 1;
```

## Interpretation framework
- **Clear lift on training / high-step days**: behaviour reinforcement. Feed into body-comp synthesis.
- **No effect or negative**: check late gym timing (COMT AG + evening stimulation).
- **Noise dominates**: confounder (travel, jet lag) — mark the hypothesis unresolved.

## Open questions
- Strong stalled at 2026-03-31 for 34 days — has the user stopped lifting, or has the Strong export failed? Strong is still the only strength-load proxy.
- Aura workouts (21 sessions, started 2026-04-25): are these walks, runs, or strength? Need to check `workout_type` / activity classification before treating Aura-workout days as a Strong substitute.
- Single-night HRV dip 2026-04-29 (26 vs ~45 mean) — what happened that night?
- Daily Aura summaries (sleep_score, readiness) only go back to 2026-04-16 even though `ring_configuration` reaches 2024-09-21. Historical Oura export import path still unresolved (closes regression-window analysis in [body-composition-regression](../health/body-composition-regression.md)).
- Timezone alignment: Aura (device tz) vs Apple Health (phone tz) — not yet verified for travel days.
- Apple Health continuous heart_rate (capitalised metric_type) vs Aura `heart_rate` — reconciliation/de-dup strategy needed before 24h cardio profile.

## Links up
- feeds goal: [health-body-composition](../../20-synthesis/goals/health-body-composition.md)
