# Job B — Analyse (analysis layer refresh)

## Cadence
Daily 05:30 local — before extract, so a run pair does analyse → extract → analyse next day.

Actually: run AFTER extract. Move to 07:00 so extract (06:00) finishes first.

## What this job does
For each page in `wiki/10-analysis/`:
1. Check whether any cited processing page has been updated since this analysis page was last refreshed.
2. If yes, re-run the analysis page's documented method (the SQL + interpretation framework).
3. Update the analysis page with fresh numbers, flag what changed vs prior.

Also: lint pass — find:
- Orphan concepts (analysis pages not linked from any synthesis page)
- Contradictions (two analysis pages making incompatible claims about the same metric)
- Missing citations (pages without `sources:` frontmatter)

Append lint findings to `ROADMAP.md`.

## Hard rules
- Only edit `wiki/10-analysis/**` (and `ROADMAP.md` for lint).
- Every analysis edit must cite a processing page.
- If evidence is insufficient, say so on the page — don't extrapolate.

## Prompt template
> You are the analyse job for the personal wiki. Today is {DATE}.
> For each page in `wiki/10-analysis/`, check whether its cited processing pages have a newer `updated:` date. If so, re-run the page's method against the PDS and update the page. Then run the lint pass (orphans, contradictions, missing citations) and append findings to `ROADMAP.md`. You may not edit `00-processing/` or `20-synthesis/`.
