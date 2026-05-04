---
layer: processing
domain: health
updated: 2026-05-04
sources:
  - table: health_metrics
    query: SELECT * FROM health_metrics WHERE source = 'aura'
  - table: workouts
    query: SELECT * FROM workouts WHERE source = 'aura'
---

# Oura / Aura

## TL;DR
**14,301 rows** in health_metrics (source=`aura`) as of 2026-05-04 — expanded v2 endpoints continuing to flow. **21 workouts** (source=`aura`). The silent failure flagged in 2026-04-29 / 2026-05-01 extracts is resolved: `heart_rate`, `readiness_score`, `vo2_max`, `cardiovascular_age`, sleep detail metrics, contributors and personal_info are all flowing. Coverage now extends back to **2024-09-21** (historical sleep restored — closes the 21-month gap).

## Actual DB coverage (verified 2026-05-04)
| metric_type | rows | first | last |
|---|---|---|---|
| heart_rate | 13,673 | 2026-04-25 | 2026-05-03 |
| activity_score | 25 | 2026-04-16 | 2026-05-03 |
| sleep_score | 17 | 2026-04-17 | 2026-05-03 |
| ring_configuration | 19 | 2024-09-21 | 2026-05-04 |
| sleep_efficiency / hr_avg / rem / light / latency / awake / total / deep | 10 each | 2026-04-25 | 2026-05-01 |
| readiness_score (+ 9 readiness_contrib_*) | 8 each | 2026-04-25 | 2026-05-02 |
| sleep_contrib_* (7 contributors) | 8 each | 2026-04-25 | 2026-05-02 |
| activity_contrib_* (6 contributors) | 8 each | 2026-04-25 | 2026-05-02 |
| resilience_level (+ 3 resilience_contrib_*) | 8 each | 2026-04-25 | 2026-05-02 |
| cardiovascular_age | 8 | 2026-04-25 | 2026-05-02 |
| spo2_avg, breathing_disturbance_index | 8 each | 2026-04-25 | 2026-05-02 |
| temperature_deviation, temperature_trend_deviation | 8 each | 2026-04-25 | 2026-05-02 |
| stress_high, recovery_high | 8 each | 2026-04-25 | 2026-05-02 |
| steps, active_calories, total_calories, target_calories, target_meters, meters_to_target | 8 each | 2026-04-25 | 2026-05-02 |
| equivalent_walking_distance, average_met_minutes | 8 each | 2026-04-25 | 2026-05-02 |
| high_activity_time, medium_activity_time, low_activity_time, sedentary_time, resting_time, non_wear_time, inactivity_alerts | 8 each | 2026-04-25 | 2026-05-02 |
| sleep_hrv_avg, sleep_hr_lowest, sleep_breath_avg | 7 each | 2026-04-25 | 2026-05-01 |
| sleep_time_recommendation | 6 | 2026-04-25 | 2026-04-30 |
| vo2_max | 5 | 2026-04-26 | 2026-05-01 |
| personal_info | 2 | 2026-05-02 | 2026-05-03 |

Workouts (source=`aura`): **21 rows**, 2026-04-25 to 2026-05-02 — walking and cycling sessions.

## Endpoints covered by connector
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
- `sleep` → per-session `sleep_total_duration`, `sleep_deep_duration`, `sleep_rem_duration`, `sleep_light_duration`, `sleep_awake_time`, `sleep_efficiency`, `sleep_latency`, `sleep_hr_avg`, `sleep_hr_lowest`, `sleep_hrv_avg`, `sleep_breath_avg`, `sleep_temperature_deviation`, `sleep_temperature_delta`. HR/HRV/5-min phase arrays kept in metadata of `sleep_total_duration`.
- `sleep_time` → `sleep_time_recommendation` with optimal bedtime window in metadata
- `heartrate` → continuous `heart_rate` samples (12,744 rows landed in current window; bulk-inserted in 500-row chunks)

Activity sessions (stored in `workouts` table, `source='aura'`):
- `workout` → `external_id` = `oura_workout_<id>`
- `session` → `external_id` = `oura_session_<id>` (HR/HRV/motion arrays in metadata; avg/max HR derived)

Other:
- `enhanced_tag` → `tag` events
- `rest_mode_period` → `rest_mode` with episode metadata
- `ring_configuration` → `ring_configuration` (per ring; `value`=size). Earliest row 2024-09-21 — anchors historical ring history.
- `personal_info` → `personal_info` (daily snapshot; `value`=age)

## Schema
- `health_metrics`: id, source, metric_type, value, unit, recorded_at, metadata, created_at — unique on `(source, metric_type, recorded_at)` provides idempotency.
- `workouts`: id, external_id, name, source, started_at, ended_at, duration, distance, distance_unit, active_energy, active_energy_unit, avg_heart_rate, max_heart_rate, location, is_indoor, metadata, route — unique on `external_id`.

## Source value
Records are stored with `source = 'aura'` (not `'oura'`) for legacy consistency with the connector name.

## Known gotchas
- v2 expanded endpoints landed between 2026-05-01 and 2026-05-03 — counts in DB jumped from 30 → 13,301. Most of the volume is `heart_rate` continuous samples.
- Daily-summary endpoints (readiness, activity, sleep details, vo2_max, cardiovascular_age) only have ~8 days of data because the connector backfill window starts ~2026-04-25. Earlier history not yet pulled.
- `ring_configuration` reaches back to 2024-09-21, but per-day daily summaries do not — historical Oura export still needed for sleep/activity series before 2026-04.
- `heartrate` is high-volume (1-sample-per-few-minutes); 7-day window can yield several thousand rows.
- `personal_info` is a daily snapshot keyed to UTC midnight — re-syncing within the same day deduplicates via the unique constraint.
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
- Daily summaries (sleep_score, activity_score, readiness_score, vo2_max, cardiovascular_age) only cover ~2026-04-16 onward despite the 2024-09-21 ring_configuration anchor. Backfill window for historical daily summaries unresolved.
- Apple Health and Oura both record HR/HRV. Need a reconciliation/de-dup strategy when merging across sources for analysis.
- 19+ month sleep gap (2024-09 to 2026-04-16): historical Oura export import path still unresolved.
- Do we want to promote heavily-queried fields (e.g. `cardiovascular_age`, `vo2_max`, `sleep_hrv_avg`) to first-class columns vs. leaving as `metric_type` rows?
