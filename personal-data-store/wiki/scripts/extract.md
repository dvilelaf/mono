# Job A — Extract (processing layer refresh)

## Cadence
Daily 06:00 local.

## What this job does
For each source listed in `wiki/00-processing/`, check the PDS for:
1. New rows since the `updated:` date in the page's frontmatter.
2. Schema drift (new `metric_name` values, new categories, new chains).

Write changes into the matching processing page. Do NOT touch the analysis or synthesis layers.

## Hard rules
- Only edit `wiki/00-processing/**`.
- Never invent numbers. If the query returns rows but no change is material, log "no material change" in the diff report.
- Bump `updated:` in frontmatter on any edit.
- If schema drifted (new column, new metric_name), append to `ROADMAP.md` rather than guessing.

## Diff report
Append a timestamped section to `ROADMAP.md` under `## Extract runs`:
- Pages touched
- New rows discovered per source
- Open questions raised

## Prompt template
> You are the extract job for the personal wiki. Today is {DATE}.
> For each page in `wiki/00-processing/`, run the documented query against the PDS at localhost:3000 (or Postgres directly at whatever is configured), compare against the page's current state, and update the page if anything material changed. Then write a diff summary to `ROADMAP.md`. You may not edit `10-analysis/` or `20-synthesis/`.
