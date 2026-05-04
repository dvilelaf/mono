---
layer: processing
domain: health
updated: 2026-04-23
sources:
  - table: health_metrics
    query: SELECT * FROM health_metrics WHERE source = 'apple_health'
  - table: workouts
    query: SELECT * FROM workouts WHERE source = 'apple_health'
---

# Apple Health

## TL;DR
**0 rows** in health_metrics (source=apple_health) and workouts (source=apple_health) as of 2026-04-23. Previous count (53,373 metrics + 1,471 workouts) was from user context, not a DB query. Manual export has not yet been run against this DB instance.

## Coverage (planned — not yet populated)
- Metrics: 2020-07 to present (three exports: CSV 2000–2020, JSON 2020–2024, JSON 2024–2026)
- Workouts: GPS routes, HR, energy
- Refresh: **MANUAL** — Health Auto Export iOS app configured for webhook but blocked on hotel WiFi. Needs home network test.

## Actual schema (verified 2026-04-23)
`health_metrics`: id, source, metric_type, value, unit, recorded_at, metadata, created_at
`workouts`: id, external_id, name, source, started_at, ended_at, duration, distance, distance_unit, active_energy, active_energy_unit, avg_heart_rate, max_heart_rate, location, is_indoor, metadata, route, created_at

## Known gotchas
- Merge of three exports — check for duplicate rows at the boundary dates (2020-12-31, 2024 cutover).
- **Schema drift corrected**: field is `metric_type` (not `metric_name`) and `recorded_at` (not `date`). Workouts use `started_at` (not `date`).

## How to query (corrected)
```sql
SELECT metric_type, COUNT(*), MIN(recorded_at), MAX(recorded_at)
FROM health_metrics
WHERE source = 'apple_health'
GROUP BY metric_type;
```

## Open questions
- Webhook functional at home? Blocks the "steady stream of raw data" goal.
- Are BCA (body composition) readings here or in a separate source?
