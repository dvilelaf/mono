---
layer: processing
domain: photos
updated: 2026-04-28
sources:
  - table: photos
    query: "-- TABLE DROPPED: photos table no longer exists as of 2026-04-28"
---

# Apple Photos

## TL;DR
**SCHEMA DRIFT: `photos` table no longer exists in the DB as of 2026-04-28.** The table was present in prior schema (migration `0003` or similar) and is referenced in `import-photos.ts` and `import-photos.py` (both deleted per git status). The media domain has been restructured to `film_reviews`. Photos import path needs rebuilding.

## Prior state (no longer accurate)
- `photos` table: 0 rows pre-wipe, 47,549 historical photos/videos planned
- Schema: id, filename, original_filename, date (timestamptz), latitude, longitude, place_name, city, country, is_photo, is_video, persons, labels, albums, metadata, created_at

## Current DB state
`photos` table: **does not exist**. `film_reviews` table exists with 59 rows (new domain).

## New tables in media domain (schema drift, 2026-04-28)
- `film_reviews`: 59 rows — appears to be the replacement for a photos/media tracking table. Schema unknown.

## Relevance to goals
- Body-composition visual timeline and travel GPS cross-check are **blocked** until the photos domain is re-established.
- Scope decision needed: rebuild photos table, or accept that photos data is out of scope for this PDS instance.

## Open questions
- Was the `photos` table intentionally dropped, or removed as part of a refactor that went too far?
- `film_reviews` — is this a separate concept (film watching log) or did it replace a broader media schema?
- If photos are back in scope: osxphotos export + a new schema/migration needed.
