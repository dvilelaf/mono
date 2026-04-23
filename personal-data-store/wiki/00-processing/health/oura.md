---
layer: processing
domain: health
updated: 2026-04-23
sources:
  - table: health_metrics
    query: SELECT * FROM health_metrics WHERE source = 'oura'
---

# Oura

## TL;DR
**0 rows** in health_metrics (source=oura) as of 2026-04-23. Previous count (1,565 metrics) was from user context, not a DB query. The 6h cron exists but has not yet populated this DB instance.

## Coverage (planned — not yet populated)
- Window: 2020-01 to present
- Metrics: sleep score, activity score (additional detail tables TBD)
- Refresh: 6h cron — see pm2 process list

## Actual schema (verified 2026-04-23)
`health_metrics`: id, source, metric_type, value, unit, recorded_at, metadata, created_at

## Known gotchas
- Sleep score is a composite; underlying components (latency, efficiency, HRV) not separately stored yet.
- Timezone: Oura returns local device timezone. Joining to other sources requires care around travel days.
- **Schema drift corrected**: field is `metric_type` (not `metric_name`) and `recorded_at` (not `date`).

## How to query (corrected)
```sql
SELECT recorded_at, metric_type, value
FROM health_metrics
WHERE source = 'oura'
ORDER BY recorded_at DESC
LIMIT 50;
```

## Open questions
- Are HRV, temperature deviation, latency available from the API and just not ingested?
- Why has the 6h cron not populated this DB instance yet?
