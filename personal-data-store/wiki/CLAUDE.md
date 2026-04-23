# Personal Wiki — Conventions

This wiki converts the Personal Data Store (PDS) into insight against the user's goals in [docs/goals-h2-2026.md](../docs/goals-h2-2026.md).

## Three layers — data flows upward only

```
PDS (Postgres)  →  00-processing/  →  10-analysis/  →  20-synthesis/
   (raw)            (normalised,       (patterns,       (blockers vs
                    per-source         cross-domain     goals, ranked)
                    notes)             correlations)
```

- A page in layer N may only cite evidence from layer N-1 or the raw PDS.
- Synthesis pages (layer 20) MUST link to at least one analysis page (layer 10).
- Analysis pages (layer 10) MUST link to at least one processing page (layer 00).
- Processing pages (layer 00) MUST cite a table + query in the PDS, or a raw file path.

If a claim can't be traced down to raw data, it does not belong in the wiki. File it in `ROADMAP.md` as an open question instead.

## Directory purpose

### `00-processing/` — what the data *is*
One page per meaningful source. Answers: what does this table actually contain, what are the gotchas, what's the coverage window, what's known-broken, how to query it.

Subfolders: `health/`, `finance/`, `genomics/`, `photos/`, `crypto/`.

### `10-analysis/` — what the data *shows*
One page per pattern, trend, or correlation. Single-domain goes under `health/`, `finance/`, `genomics/`. Cross-domain goes under `cross/`.

### `20-synthesis/` — what to *do about it*
- `goals/` — one page per goal from goals-h2-2026.md, updated with live status and top blockers.
- `blockers/` — one page per identified blocker to a goal. Must link to (a) the goal it blocks and (b) the analysis page(s) that evidence it.

Synthesis is the only layer the user reads for decisions. Keep it scannable.

## Page format

Every page starts with frontmatter:

```yaml
---
layer: processing | analysis | synthesis
domain: health | finance | genomics | photos | crypto | cross
updated: YYYY-MM-DD
sources:
  - table: health_metrics
    query: SELECT ... (or file path)
  - page: ../00-processing/health/oura.md
---
```

Then:
- **TL;DR** — one sentence
- **Body** — claim + evidence + limitations
- **Open questions** — what we don't know

## Citation rules

- Every quantitative claim needs a source row. If the number came from running a query, include the query.
- Never invent numbers. If you don't know, write `?` and append to `ROADMAP.md`.
- Dates are absolute (`2026-04-23`), never relative.
- Health and biomarker claims must cite panel date and lab.

## Goal alignment

Synthesis output exists to surface what's holding the user back from goals. For each blocker, answer:
1. Which goal does this block?
2. What's the evidence?
3. What's the smallest next action?
4. What data is missing before we can be more certain?

## Jobs

Three scheduled jobs live in `scripts/`. Each has a markdown prompt template and is registered with `scheduled-tasks` MCP.

- `extract.md` — pulls new rows from PDS, updates `00-processing/`.
- `analyse.md` — re-runs patterns on processing updates, writes to `10-analysis/`.
- `synthesise.md` — re-ranks blockers against current goals, writes to `20-synthesis/`.

All three write to their layer only. None edit `goals-h2-2026.md` or raw PDS data.

## What belongs in `ROADMAP.md`

- Contradictions found during lint
- Orphan concepts
- Open questions where evidence is insufficient
- Missing data sources that would unblock a synthesis claim
- Stale pages (`updated` older than the data refresh cadence for that source)
