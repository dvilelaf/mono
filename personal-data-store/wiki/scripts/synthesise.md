# Job C — Synthesise (delta, scorecard, decision queue)

## Cadence
Tue/Thu 08:00 local. After morning extract + analyse.

## What this job does
Produce three short, action-oriented outputs in `wiki/20-synthesis/`. Replace any prior copy of these files in place — they are not dated.

1. **what-changed.md** — delta report since last run.
2. **goal-scorecard.md** — RED / AMBER / GREEN per goal.
3. **decision-queue.md** — ranked list of things needing the user's attention.

Also keep the per-goal pages in `wiki/20-synthesis/goals/` and the blocker pages in `wiki/20-synthesis/blockers/` consistent with the new outputs (same hard rules as before — every claim cites an analysis page; never edit the `goals-h2-2026` document row; never touch `00-processing/` or `10-analysis/`).

## Inputs to read

Before writing anything:

1. **Current state** — every file under `wiki/10-analysis/` and the goal pages under `wiki/20-synthesis/goals/`.
2. **Previous synthesis** — the existing `wiki/20-synthesis/what-changed.md`, `goal-scorecard.md`, `decision-queue.md`, and the most recent `YYYY-MM-DD-read-me.md` if one exists. These are the basis for "since last run".
3. **Fresh DB numbers** — query the PDS directly. Use `psql` against `$DATABASE_URL` (or `PGPASSWORD=... psql -h localhost -U pds pds`) for things like:
   - latest `yield_positions` snapshot, summed deployed capital, current APY coverage
   - `transactions` outflows by month (filter currency, exclude null categories explicitly)
   - latest `metrics` rows for ApoB, Lp(a), homocysteine, BCA, HRV, sleep
   - count of new rows ingested since the previous synthesis run
4. **Document corpus** — call the documents search API for relevant context. Use the `$API_KEY` env var (already loaded from `.env` at repo root). Examples:

   ```bash
   curl -s -X POST http://localhost:3000/api/documents/search-v2 \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query":"yield tax treatment countdefi","limit":5}'
   ```

   Run searches for the topics that map to each goal you're synthesising. Suggested queries:
   - Yield/finance goals: `"yield tax treatment countdefi"`, `"DeFi yield EY"`, `"MEXC capital deployment"`
   - Health goals: `"randox panel results"`, `"ApoB Lp(a) trajectory"`, `"body composition DEXA"`
   - Cross-cutting: `"goals H2 2026"`, plus any topic referenced in a blocker page
   
   Cite documents in outputs as `[doc: <title or slug>]` so the reader can find them.

## Output 1 — `wiki/20-synthesis/what-changed.md`

Sections, in this order, each ≤ 6 bullets:

- **Moved since last run** — concrete changes vs the previous synthesis (yield total, monthly spend figure, latest metric values, blocker count).
- **Anomalies** — any health metric that changed >15% from the previous reading; any spending spike; any yield position that moved materially. State the prior value, the new value, and the magnitude.
- **New data ingested** — new Randox panel, new transactions window, new documents indexed (mention any new search hits that weren't there last run).
- **Blockers — resolved vs new** — two short lists.

Frontmatter: `layer: synthesis`, `domain: cross`, `updated: {DATE}`.

## Output 2 — `wiki/20-synthesis/goal-scorecard.md`

One row per goal page in `wiki/20-synthesis/goals/`. Sort by urgency (RED first, then AMBER nearest deadline, then GREEN).

```
| Status | Goal | Evidence | Next action |
|--------|------|----------|-------------|
| 🔴 RED | … | … | … |
```

Rules:
- **RED** = stalled or regressed; deadline at risk; or evidence gap that blocks measurement.
- **AMBER** = no measurable movement since last run, but not yet at risk.
- **GREEN** = measurable progress this cycle.
- "Evidence" cites either an analysis page or a document hit. One short sentence.
- "Next action" must be the smallest concrete step (≤ 1 day of effort).

Frontmatter as above.

## Output 3 — `wiki/20-synthesis/decision-queue.md`

The most actionable file. Ranked list of things needing the user's attention, ordered by `impact × urgency`. Aim for 5–10 items.

For each item:
- **Heading**: imperative, concrete (e.g. "Book May Randox panel", "Resolve EY DeFi tax conversation", "Deploy idle MEXC capital").
- **What the decision is**: one sentence.
- **Supporting data**: numbers from the DB, citation to analysis page, and any relevant `[doc: …]` hits.
- **Options**: 2–3 bulleted choices.
- **Deadline**: explicit date if any, otherwise "no hard deadline".

Things like "EY conversation overdue", "MEXC capital still idle", "May panel coming up — book it" should appear here when supported by evidence.

Frontmatter as above.

## Hard rules
- Only edit files under `wiki/20-synthesis/**`.
- Every numeric claim either comes from a fresh DB query in this run or cites an analysis page that does.
- Every blocker claim links to an analysis page.
- If evidence is insufficient, the item becomes "resolve the evidence gap" — its action is to fix the analysis page, not to act on the unsupported claim.
- Never edit the `documents` row with slug `goals-h2-2026`.
- No padding. Bullets, not paragraphs. If a section has nothing to say, write "nothing this cycle" — do not invent material.
- Concise: each output should be readable in under 2 minutes.

## Per-goal page maintenance
After producing the three top-level files, walk `wiki/20-synthesis/goals/`. For each goal:
- Reconcile its **Top blockers (ranked)** list with the new decision queue.
- Bump `updated:` in frontmatter only if anything changed.
- Create or update blocker pages under `wiki/20-synthesis/blockers/` to match.

## Prompt template
> You are the synthesise job for the personal wiki. Today is {DATE}.
> Produce three outputs in `wiki/20-synthesis/`: `what-changed.md` (delta vs previous synthesis), `goal-scorecard.md` (RED/AMBER/GREEN per goal), and `decision-queue.md` (ranked actionable items). Read `wiki/10-analysis/` for current state and the previous versions of the three files for delta comparison. Query the PDS via `psql` for fresh numbers. Call `POST http://localhost:3000/api/documents/search-v2` with `Authorization: Bearer $API_KEY` to pull document context for each goal area. Keep per-goal pages and blocker pages consistent with the new outputs. You may not edit `00-processing/`, `10-analysis/`, or the `documents` table.
