# Job C — Synthesise (blocker re-ranking against goals)

## Cadence
Tue/Thu 08:00 local. After morning analyse run.

## What this job does
For each goal page in `wiki/20-synthesis/goals/`:
1. Re-read the goal definition from `docs/goals-h2-2026.md` (authoritative — never edited by this job).
2. Walk the cited analysis pages. For each, identify what's blocking progress.
3. Update the goal page's **Top blockers (ranked)** list. Rank by: (a) magnitude of goal impact, (b) smallness of next action, (c) recency of evidence.
4. Create or update blocker pages in `blockers/` to match.

Also produce one standalone note in `20-synthesis/` named `YYYY-MM-DD-read-me.md` — the thing the user actually reads. Under 500 words. Format:
- Top 3 blockers across all goals this cycle
- What moved since last run
- One question the user should answer to unblock the biggest one

## Hard rules
- Only edit `wiki/20-synthesis/**`.
- Every blocker claim must link to an analysis page.
- If an analysis page's evidence is insufficient, the corresponding blocker becomes "resolve the evidence gap" and the action is to fix the analysis page, not to act on the unsupported claim.
- Never edit `docs/goals-h2-2026.md`.

## Prompt template
> You are the synthesise job for the personal wiki. Today is {DATE}.
> Walk `wiki/20-synthesis/goals/`. For each goal, re-read the authoritative goal text in `docs/goals-h2-2026.md`, walk cited analysis pages, re-rank blockers, and update the goal page and relevant blocker pages. Then write today's `YYYY-MM-DD-read-me.md` summarising the top 3 cross-goal blockers under 500 words. You may not edit `00-processing/`, `10-analysis/`, or `docs/`.
