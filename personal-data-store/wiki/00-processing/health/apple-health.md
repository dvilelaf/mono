---
layer: processing
domain: health
updated: 2026-05-04
sources:
  - table: health_metrics
    query: SELECT * FROM health_metrics WHERE source = 'apple_health'
  - table: workouts
    query: SELECT * FROM workouts WHERE source = 'apple_health'
---

# Apple Health

## TL;DR
**830,859 rows** in health_metrics (source=apple_health), **1,471 workouts** as of 2026-05-04. Metrics span 2015-04-20 to 2026-05-03; workouts span 2024-08-25 to 2026-04-07 (workouts still capped 2026-04-07, ~27 days stale). +105,518 rows since 2026-05-03 — continued daily flow of per-minute heart_rate samples (`heart_rate_Avg/Min/Max`, now 242,044 rows each, advanced from 208,667).

## Coverage (actual — populated)
- Metrics: 2015-04-20 to 2026-05-03 (830,859 rows across 65+ metric types)
- Workouts: 2024-08-25 to 2026-04-07 (1,471 sessions, source=apple_health) — **stalled at 2026-04-07** (27 days)
- Refresh: **MANUAL** — Health Auto Export iOS app configured for webhook but still needs home-network test for live streaming.

## Actual schema (verified 2026-04-23)
`health_metrics`: id, source, metric_type, value, unit, recorded_at, metadata, created_at
`workouts`: id, external_id, name, source, started_at, ended_at, duration, distance, distance_unit, active_energy, active_energy_unit, avg_heart_rate, max_heart_rate, location, is_indoor, metadata, route, created_at

## Top metric types (verified 2026-05-04)
| metric_type | rows | coverage |
|---|---|---|
| heart_rate_Avg | 242,044 | 2026-04-25 to 2026-05-03 |
| heart_rate_Min | 242,044 | 2026-04-25 to 2026-05-03 |
| heart_rate_Max | 242,044 | 2026-04-25 to 2026-05-03 |
| basal_energy_burned | 11,928 | 2024-07-23 to 2026-05-03 |
| active_energy | 9,482 | 2015-10 to 2026-05 |
| step_count | 7,966 | 2015-09 to 2026-05 |
| flights_climbed | 3,917 | 2015-09 to 2026-05 |
| apple_stand_time | 3,674 | 2021-12 to 2026-05 |
| apple_exercise_time | 3,405 | 2015-10 to 2026-05 |
| walking_running_distance | 3,346 | 2024-07-04 to 2026-05-02 |
| walking_and_running_distance | 3,212 | 2015-04-20 to 2024-07-03 |
| resting_heart_rate | 2,326 | 2017-09 to 2026-05 |
| heart_rate_variability | 2,142 | 2017-09 to 2026-05 |
| heart_rate_avg / min / max (legacy lowercase) | 2,125 each | 2015-10 to 2024-05-27 |
| sleep_analysis_* (7 variants) | ~1,516 each | 2015-10 to 2024-07 |
| blood_oxygen_saturation | 1,493 | 2021-12 to 2026-04 |
| weight | 277, body_mass_index 276, weight_body_mass 226 | mixed |
| body_fat_percentage, lean_body_mass | 129 each | mixed |
| dietary nutrients (carbohydrates, protein, fat splits, sodium, iron, cholesterol, dietary_energy) | 16 each | brief logging window |

Notes:
- `heart_rate_Avg/Min/Max` (capitalised) is the new continuous-HR feed for Apr–May 2026; the lowercase `heart_rate_avg/min/max` legacy series ends 2024-05-27. Likely a Health Auto Export schema change — joining requires aware filtering on case.
- `walking_and_running_distance` (snake-case) ends 2024-07; replaced by `walking_running_distance` (no "and") in later iOS — same metric, different identifier.
- `sleep_analysis_*` ends 2024-07 — Oura/Aura took over sleep tracking from that point.
- Body composition: `weight`, `body_mass_index`, `weight_body_mass`, `body_fat_percentage`, `lean_body_mass` are present but row counts are sparse. BCA (body composition analysis) appears to be in this table, surfaced through these metric types.

## Known gotchas
- Merge of three exports — check for duplicate rows at the boundary dates (2020-12-31, 2024 cutover).
- `sleep_analysis_*` data ends 2024-07; post-2024 sleep data is in source=`aura`.
- Workouts coverage starts 2024-08 only — pre-2024 workout history not imported for workouts table (though GPS/HR in metrics may exist).
- **Schema drift corrected**: field is `metric_type` (not `metric_name`) and `recorded_at` (not `date`). Workouts use `started_at` (not `date`).

## How to query
```sql
SELECT metric_type, COUNT(*), MIN(recorded_at), MAX(recorded_at)
FROM health_metrics
WHERE source = 'apple_health'
GROUP BY metric_type
ORDER BY COUNT(*) DESC;
```

## Open questions
- Workouts still stalled at 2026-04-07 (26 days behind metrics). Why is the workouts feed lagging the metrics feed by nearly a month?
- Per-minute `heart_rate_Avg/Min/Max` only landed for 2026-04-25 → 2026-05-02 (~626K rows). Is the export job pulling forward a rolling window, or did it just start? Will earlier history be backfilled?
- `heart_rate_Avg` (caps) vs `heart_rate_avg` (lowercase) — confirm these are equivalent metrics under different identifier casings before merging in analysis.
- Body composition coverage (`body_fat_percentage` 129 rows, `lean_body_mass` 129) — define the "best composition" window for [body-composition-regression](../../10-analysis/health/body-composition-regression.md) using these series.
- `walking_and_running_distance` → `walking_running_distance` rename confirmed at 2024-07 cutover; do analyses need to UNION both?
