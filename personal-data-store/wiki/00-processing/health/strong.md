---
layer: processing
domain: health
updated: 2026-04-28
sources:
  - table: workouts
    query: SELECT * FROM workouts WHERE source = 'strong'
---

# Strong (gym)

## TL;DR
**59 sessions** in workouts (source=strong) as of 2026-04-28, spanning 2025-03-13 to 2026-03-31. Most recent session: 2026-03-31. Import now live.

## Coverage (actual — populated)
- Window: 2025-03-13 to 2026-03-31 (59 sessions)
- Refresh: **MANUAL** — re-export from Strong app periodically

## Recent session frequency (verified 2026-04-28)
| week | sessions |
|---|---|
| 2026-03-30 | 1 |
| 2026-03-23 | 1 |
| 2026-03-16 | 1 |
| 2026-03-09 | 2 |
| 2026-03-02 | 1 |
| 2026-02-23 | 3 |

Target: 2×/week. Recent average: ~1–2/week. Fell short of target most weeks.

## Relevance to goals
- Body comp goal: target 2×/week gym. Current average ~1–1.5/week based on recent data — below target.
- Data gap: last imported session is 2026-03-31. Any sessions in April 2026 are missing.

## Actual schema (verified 2026-04-23)
`workouts`: id, external_id, name, source, started_at, ended_at, duration, distance, distance_unit, active_energy, active_energy_unit, avg_heart_rate, max_heart_rate, location, is_indoor, metadata, route, created_at

## Known gotchas
- **Schema drift corrected**: workouts use `started_at` (not `date`). Exercise set details likely live in `metadata` jsonb.

## How to query
```sql
SELECT DATE_TRUNC('week', started_at) AS week, COUNT(*) AS sessions
FROM workouts
WHERE source = 'strong'
GROUP BY 1 ORDER BY 1 DESC;
```

## Open questions
- Is per-exercise volume stored in `metadata` jsonb, or is there a separate sets table?
- April 2026 sessions missing — when will the next CSV export be done?
