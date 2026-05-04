---
layer: processing
domain: photos
updated: 2026-04-23
sources:
  - table: photos
    query: SELECT * FROM photos
---

# Apple Photos

## TL;DR
**0 rows** in photos as of 2026-04-23. Previous count (47,549 photos/videos) was from user context, not a DB query. osxphotos export has not yet been run against this DB instance.

## Actual schema (verified 2026-04-23)
`photos`: id, filename, original_filename, date (timestamptz), latitude, longitude, place_name, city, country, is_photo, is_video, persons (jsonb), labels (jsonb), albums (jsonb), metadata (jsonb), created_at

Note: `ai_caption` is **not a column** — would live in `metadata` jsonb if stored at all.

## Coverage (planned — not yet populated)
- Window: 2006 – present
- Attributes: GPS, place_name, city, country, persons, labels, albums
- Refresh: **MANUAL** — re-run osxphotos export

## Known gotchas
- **Schema drift corrected**: `date` is a timestamptz (not date). The query `WHERE date BETWEEN ...` still works but use timestamptz literals.
- No `ai_caption` column — check `metadata` jsonb if needed.

## Relevance to goals
- Indirect. Could support body-composition visual timeline (front-facing photos, Apr–Nov 2025 waist-expansion window).
- Travel spending cross-check: photo GPS vs travel tx dates.

## How to query (corrected)
```sql
SELECT place_name, COUNT(*)
FROM photos
WHERE date BETWEEN '2025-04-01' AND '2025-11-30'
GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
```

## Open questions
- Is this source worth keeping in live sync, or does it add noise vs signal for goal-oriented synthesis?
- When will the osxphotos export be run?
