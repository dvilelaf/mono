---
layer: processing
domain: meta
updated: 2026-04-24
sources:
  - table: documents
    query: SELECT id, title, content, updated_at FROM documents WHERE source = 'goals-h2-2026'
---

# Goals (source of truth)

## TL;DR
The goals document lives in the `documents` table, not in `docs/goals-h2-2026.md`. The markdown file may be deleted from the repo — the wiki must cite the DB row, not the file, or synthesis pages break when the file moves.

## Why in-DB
- Survives file deletions and reorganisations.
- Queryable by other tools (Claude Desktop MCP, future PDS agent skill) without needing repo access.
- Versionable via `updated_at` and future embeddings.
- One place the synthesis layer can always find the authoritative goals text.

## Current row
- **slug:** `goals-h2-2026`
- **domain:** `meta`
- **type:** `goals`
- **source:** `goals-h2-2026`
- **title:** "Goals: April – October 2026"
- **metadata:** `{"slug":"goals-h2-2026","supersedes_file":"docs/goals-h2-2026.md"}`

## How to retrieve
```sql
SELECT content
FROM documents
WHERE source = 'goals-h2-2026'
ORDER BY updated_at DESC
LIMIT 1;
```

## How to update
Do NOT edit the `docs/goals-h2-2026.md` file and expect it to flow through. Update by:
1. Editing the document in place via the PDS frontend or a direct SQL UPDATE.
2. Bumping `updated_at` (handled automatically by the table default on update).
3. The synthesise job re-reads this row each run and re-ranks blockers against it.

If you must keep a markdown mirror for human-readable review, re-export from the DB to a file — don't edit the file as the source.

## Open questions
- Is `documents` backed up? Yes — daily via `pds-backup` (validated 2026-04-24). Lives inside the `pg_dump` output.
- Should goals be split into one document per section (health/finance/data)? Currently one umbrella doc. Split later if synthesis needs finer granularity.
- When embeddings land, this doc should be chunked by `##` heading for retrieval.
