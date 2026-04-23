---
layer: processing
domain: health
updated: 2026-04-23
sources:
  - table: workouts
    query: SELECT * FROM workouts WHERE source = 'strong'
---

# Strong (gym)

## TL;DR
**0 rows** in workouts (source=strong) as of 2026-04-23. Previous count (59 sessions, 1,061 sets) was from user context, not a DB query. CSV import has not yet been run against this DB instance.

## Coverage (planned — not yet populated)
- Window: 2025-03 to present
- Aggregated by session with exercise breakdowns
- Refresh: **MANUAL** — re-export from Strong app periodically

## Actual schema (verified 2026-04-23)
`workouts`: id, external_id, name, source, started_at, ended_at, duration, distance, distance_unit, active_energy, active_energy_unit, avg_heart_rate, max_heart_rate, location, is_indoor, metadata, route, created_at

## Known gotchas
- **Schema drift corrected**: workouts use `started_at` (not `date`). Exercise set details likely live in `metadata` jsonb.

## Relevance to goals
- Body comp goal: target 2×/week gym. This source is the primary signal for gym adherence.
- Leg muscle deficit (-1/-1 BCA): lift volume + frequency on leg days should be trackable here.

## How to query (corrected)
```sql
SELECT DATE_TRUNC('week', started_at) AS week, COUNT(*) AS sessions
FROM workouts
WHERE source = 'strong'
GROUP BY 1 ORDER BY 1 DESC;
```

## Open questions
- Is per-exercise volume stored in `metadata` jsonb, or is there a separate sets table?
- When will the Strong CSV be imported?
