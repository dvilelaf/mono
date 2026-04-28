---
layer: processing
domain: health
updated: 2026-04-28
sources:
  - table: health_metrics
    query: SELECT * FROM health_metrics WHERE source = 'aura'
  - table: workouts
    query: SELECT * FROM workouts WHERE source = 'aura'
---

# Oura

## TL;DR
Connector now pulls every Oura v2 user-collection endpoint. Numeric data lands in `health_metrics` (source=`aura`); workouts and sessions land in `workouts` (source=`aura`).

## Endpoints covered (2026-04-28)
Daily summaries:
- `daily_sleep` → `sleep_score` + per-contributor metrics (`sleep_contrib_*`)
- `daily_activity` → `activity_score`, `steps`, `active_calories`, `total_calories`, `equivalent_walking_distance`, `high_activity_time`, `medium_activity_time`, `low_activity_time`, `sedentary_time`, `resting_time`, `non_wear_time`, `target_calories`, `target_meters`, `meters_to_target`, `inactivity_alerts`, `average_met_minutes`, `activity_contrib_*`
- `daily_readiness` → `readiness_score`, `temperature_deviation`, `temperature_trend_deviation`, `readiness_contrib_*`
- `daily_spo2` → `spo2_avg`, `breathing_disturbance_index`
- `daily_stress` → `stress_high`, `recovery_high`
- `daily_resilience` → `resilience_level` (1=limited..5=exceptional), `resilience_contrib_*`
- `daily_cardiovascular_age` → `cardiovascular_age`
- `vO2_max` → `vo2_max`

Detail / time-series:
- `sleep` → per-session `sleep_total_duration`, `sleep_deep_duration`, `sleep_rem_duration`, `sleep_light_duration`, `sleep_awake_time`, `sleep_efficiency`, `sleep_latency`, `sleep_hr_avg`, `sleep_hr_lowest`, `sleep_hrv_avg`, `sleep_breath_avg`, `sleep_temperature_deviation`, `sleep_temperature_delta`. Heart-rate / HRV / 5-min phase arrays kept in metadata of `sleep_total_duration`.
- `sleep_time` → `sleep_time_recommendation` with optimal bedtime window in metadata
- `heartrate` → continuous `heart_rate` samples (bulk-inserted in 500-row chunks)

Activity sessions (stored in `workouts` table):
- `workout` → `external_id` = `oura_workout_<id>`
- `session` → `external_id` = `oura_session_<id>` (HR/HRV/motion arrays in metadata; avg/max HR derived)

Other:
- `enhanced_tag` → `tag` events
- `rest_mode_period` → `rest_mode` with episode metadata
- `ring_configuration` → `ring_configuration` (per ring; `value`=size)
- `personal_info` → `personal_info` (daily snapshot; `value`=age)

## Schema
- `health_metrics`: id, source, metric_type, value, unit, recorded_at, metadata, created_at — unique on `(source, metric_type, recorded_at)` provides idempotency.
- `workouts`: id, external_id, name, source, started_at, ended_at, duration, distance, distance_unit, active_energy, active_energy_unit, avg_heart_rate, max_heart_rate, location, is_indoor, metadata, route — unique on `external_id`.

## Source value
Records are stored with `source = 'aura'` (not `'oura'`) for legacy consistency with the connector name. Queries below use that.

## Known gotchas
- Sync isolates errors per endpoint: a 4xx from one Oura endpoint no longer aborts the whole run; it appears in `SyncResult.errors`.
- `heartrate` is high-volume (1-sample-per-few-minutes). A 7-day window can yield several thousand rows.
- `personal_info` is a daily snapshot keyed to UTC midnight — re-syncing within the same day deduplicates via the unique constraint.
- `ring_configuration` `set_up_at` is used as `recorded_at`; if absent, falls back to `now()`.
- `resilience_level` is mapped to a 1–5 integer. The original string is preserved in metadata.
- Timezone: Oura returns local-device timezone for daily endpoints. Joining to other sources still requires care around travel days.

## How to query
```sql
-- All Oura sleep scores in the last 30 days
SELECT recorded_at, value
FROM health_metrics
WHERE source = 'aura' AND metric_type = 'sleep_score'
  AND recorded_at > NOW() - INTERVAL '30 days'
ORDER BY recorded_at DESC;

-- HRV during sleep
SELECT recorded_at, value
FROM health_metrics
WHERE source = 'aura' AND metric_type = 'sleep_hrv_avg'
ORDER BY recorded_at DESC LIMIT 50;

-- Cardiovascular age trend (LDLR-relevant)
SELECT recorded_at, value
FROM health_metrics
WHERE source = 'aura' AND metric_type = 'cardiovascular_age'
ORDER BY recorded_at DESC;

-- Oura workouts and meditation sessions
SELECT started_at, ended_at, name, metadata->>'oura_kind' AS kind
FROM workouts
WHERE source = 'aura'
ORDER BY started_at DESC LIMIT 50;
```

## Open questions
- Apple Health and Oura both record HR/HRV. Need a reconciliation/de-dup strategy when merging across sources for analysis.
- Do we want to promote heavily-queried fields (e.g. `cardiovascular_age`, `vo2_max`, sleep_hrv_avg`) to first-class columns vs. leaving as `metric_type` rows?
