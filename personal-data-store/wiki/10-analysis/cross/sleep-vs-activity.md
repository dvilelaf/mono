---
layer: analysis
domain: cross
updated: 2026-04-23
sources:
  - page: ../../00-processing/health/oura.md
  - page: ../../00-processing/health/apple-health.md
  - page: ../../00-processing/health/strong.md
---

# Sleep × activity — does training affect sleep?

## TL;DR
Hypothesis: gym days and high-step days lift sleep score. Testable with the data in hand. Good canary for whether cross-domain analysis is worth the effort.

## Method
Join daily: steps (apple_health) + sleep_score (oura) + gym_session_flag (strong). Compute:
- Mean sleep score on gym days vs non-gym days
- Correlation of step count with next-night sleep score
- Effect of intense lift days (load proxy) on HRV if available

```sql
WITH daily AS (
  SELECT d::date AS date,
    COALESCE(s.value,0) AS steps,
    COALESCE(o.value,NULL) AS sleep,
    EXISTS(SELECT 1 FROM workouts w WHERE w.source='strong' AND w.date=d) AS gym
  FROM generate_series('2025-01-01'::date, CURRENT_DATE, '1 day') d
  LEFT JOIN health_metrics s ON s.date=d AND s.source='apple_health' AND s.metric_name='steps'
  LEFT JOIN health_metrics o ON o.date=d AND o.source='oura' AND o.metric_name='sleep_score'
)
SELECT gym, AVG(sleep) FROM daily GROUP BY 1;
```

## Interpretation framework
- **Clear lift on gym / high-step days**: behaviour reinforcement. Feed into body-comp synthesis.
- **No effect or negative**: check late gym timing (COMT AG + evening stimulation).
- **Noise dominates**: confounder (travel, jet lag) — mark the hypothesis unresolved.

## Open questions
- Is HRV in the Oura ingestion? Currently only sleep_score confirmed.
- Does timezone alignment hold across Oura (device tz) and Apple Health (phone tz)?
