# ROADMAP

Items here are contradictions, open questions, or missing data sources that can't yet be traced to raw data. See the wiki layer conventions in `wiki/CLAUDE.md`.

---

## Extract runs

### 2026-04-29T06:00 — Daily extract

**Pages touched:**
- `wiki/00-processing/crypto/yield-positions.md`
- `wiki/00-processing/health/oura.md` (also resolved git merge conflict)
- `wiki/00-processing/meta/connectors.md`

**New rows discovered per source (since 2026-04-28):**
| source | table | rows before | rows after | delta |
|---|---|---|---|---|
| crypto connector | yield_positions | 27 | 36 | +9 (1 new snapshot for 2026-04-28) |
| crypto connector | portfolio_snapshots | 1,714 | 1,993 | +279 (2026-04-29 running: 272 so far) |
| aura connector | health_metrics | 23 | 25 | +2 (activity_score=99, sleep_score=92 for 2026-04-28) |
| all others | — | — | — | no material change |

**No-change sources (verified):**
- transactions (10,943 rows, max 2026-04-08)
- health_metrics/apple_health (73,641 rows, max 2026-04-06)
- workouts/strong (59 sessions, max 2026-03-31)
- workouts/apple_health (1,471 sessions, max 2026-04-07)
- genomics_variants (230), genomics_profiles (1)
- health_metrics/randox (63 rows, max 2025-11-18)

**Open questions raised:**

1. **Oura expanded metrics absent**: The connector was upgraded 2026-04-28 to pull all Oura v2 endpoints (readiness, HRV, cardiovascular_age, heartrate, vo2_max, workouts, etc.) but as of 2026-04-29 only `activity_score` and `sleep_score` are in the DB. Check `connector_runs` for errors on the aura connector post-upgrade — did the new endpoints return data or errors?

2. **yield_positions APY still NULL**: 4 snapshots collected, APY field remains NULL in all. Annualised yield for $170K goal is not computable from DB. DeFiLlama APY lookup or manual rates needed.

3. **Strong gap**: Last gym session 2026-03-31; 29 days without a new export. Target is 2×/week — April 2026 sessions are missing from the DB.

4. **oura.md merge conflict**: Was present on disk (git stash vs upstream divergence). Resolved in this extract run — upstream version (expanded connector spec) was used as base, actual DB counts updated to current state.

---

## Schema drift log

### 2026-04-28 — New tables (no processing pages yet)
These tables exist in DB but lack `00-processing/` pages:
- `film_reviews` (59 rows) — media/culture tracking, likely Letterboxd-style
- `nutrition_entries` (0 rows) — planned MyFitnessPal target
- `personality_assessments` (1 row) — unknown source
- `supplements` (0 rows) — planned supplement tracking
- `subscriptions` (465 rows, connector=`subscriptions`) — schema: name, amount, currency, frequency, status, confidence, first_seen, last_seen, next_expected, category, metadata

---

## Analyse runs

### 2026-05-03T07:00 — Daily analyse lint

**Pages refreshed (cited processing pages newer than analysis page):**
- `wiki/10-analysis/health/apob-trajectory.md` — randox.md (2026-05-03) added 3 historical panels; trajectory now 110 → 119 → 88 → 113.
- `wiki/10-analysis/finance/yield-gap.md` — yield-positions.md (2026-05-03) populated APY for latest snapshot; annualised yield computable for the first time at $131,753 USD/yr + £10,795 GBP/yr.
- `wiki/10-analysis/cross/sleep-vs-activity.md` — oura.md (2026-05-03) confirmed expanded v2 metrics now landing (HRV, readiness, cardiovascular_age, VO2 max, continuous heart rate).
- `wiki/10-analysis/health/body-composition-regression.md` — apple-health.md / oura.md updated 2026-05-03 but new rows fall outside the Apr–Nov 2025 regression window; soft refresh only.

**Not refreshed (no source delta):**
- `wiki/10-analysis/finance/monthly-spend.md` — only source (transactions.md, 2026-04-28) unchanged since last analysis refresh.

**Lint — orphans:** none. All 5 analysis pages are linked from at least one synthesis page (goal or blocker).

**Lint — missing citations:** none. All 5 analysis pages have `sources:` frontmatter pointing at processing pages.

**Lint — contradictions / cross-layer staleness (synthesis layer needs refresh):**
1. `wiki/20-synthesis/blockers/apy-null-in-db.md` claims "APY is NULL for all 27 yield position rows" and total $3,902,453 — the refreshed yield-gap analysis shows APY populated for the 2026-05-02 snapshot (annualised yield $131,753 USD + £10,795 GBP) and total $3,744,446 USD + £254,000 GBP. Blocker is largely resolved by data; synthesis page needs rewrite or closure.
2. `wiki/20-synthesis/blockers/coinbase-balance-manual.md` quotes yield-gap saying "Coinbase manual screenshot 2026-04-08 ... no APY stored" and "$1,146,000" — Coinbase is now $1,250,000 with APY 3.50 in latest snapshot (still manual entry, but value and APY updated).
3. `wiki/20-synthesis/blockers/apob-values-not-loaded.md` claims "only 1 ApoB value in PDS" — 4 are now loaded (2024-06-27, 2024-08-05, 2025-04-01, 2025-11-18). Blocker resolved by data.
4. `wiki/20-synthesis/goals/finance-yield-170k.md` Status quotes 2026-04-27 snapshot ($3,902,453) and "APY NULL"; needs refresh to current values.
5. `wiki/20-synthesis/goals/health-cardiovascular.md` Status references "Single data point: ApoB 113"; needs refresh to full 4-point trajectory and the unexplained 88 → 113 regression.

These cross-layer items are out of scope for the analyse job (it may not edit `20-synthesis/`). They are queued for the synthesise job to action.

**Lint — within-layer contradictions:** none detected. The two analyses that touch overlapping metrics (`body-composition-regression` and `sleep-vs-activity` both reference Strong stall and the Aura sleep window) agree on the underlying numbers.

**Carried-forward open questions surfaced this run:**
- ApoB regression 2025-04 → 2025-11 (88 → 113, +25) — co-temporal with the body composition regression in the same window. Common driver hypothesis (diet, weight, supplement) — needs investigation. Filed in both analysis pages.
- 2025-11-18 Randox panel missing lipid panel, hsCRP, HbA1c, glucose, insulin, vitamin D, folate despite earlier panels having them — suspected PDF extraction gap rather than panel scope change.
- Strong stalled at 2026-03-31 for 33 days — gym × sleep comparison can't run; data infrastructure now ready (Oura HRV landing).
- Aura daily summary backfill: `ring_configuration` reaches 2024-09-21 but daily series only 2026-04-16 onward — historical Oura export import path still unresolved; gates the Apr–Nov 2025 sleep gap.
