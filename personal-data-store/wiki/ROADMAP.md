# Wiki ROADMAP

Open questions, missing data, contradictions, lint findings. Jobs append here; humans drain it.

## Seed open questions (from initial compile 2026-04-23)

### Processing gaps
- Oura: are HRV, temperature deviation, sleep latency available from the API but not yet ingested? See [oura.md](00-processing/health/oura.md).
- Apple Health: webhook blocked on hotel WiFi — needs home network retest.
- Apple Health: is BCA (body composition) in this table or a separate source?
- Randox: is the May 2026 panel requisition including homocysteine + MMA?
- Randox: is pancreatic amylase/lipase tracked as a metric or only noted?
- Strong: is per-exercise lift volume queryable, or only session counts?
- Transactions: how many remain uncategorised? Needs query.
- Transactions: is the merchant review backlog tracked anywhere?
- Yield positions: is the $1.4M Coinbase manual entry current?
- Yield positions: can DeFiLlama APY snapshots be persisted per position at each balance snapshot?

### Analysis populate
- [apob-trajectory](10-analysis/health/apob-trajectory.md) — four historical ApoB values not yet loaded into page.
- [body-composition-regression](10-analysis/health/body-composition-regression.md) — "best composition" window needs defining.
- [yield-gap](10-analysis/finance/yield-gap.md) — per-bucket expected APY candidates not populated.
- [monthly-spend](10-analysis/finance/monthly-spend.md) — April 2026 actual figure not yet run.
- [sleep-vs-activity](10-analysis/cross/sleep-vs-activity.md) — hypothesis untested; is HRV in ingestion?

### Synthesis gaps
- All blocker pages are stubs. Synthesise job must populate "Smallest next action" and "What would raise certainty" for each.
- No read-me yet — first synthesise run will produce `YYYY-MM-DD-read-me.md`.

### Infra
- Register the three scheduled jobs with the `scheduled-tasks` MCP. Cron times:
  - extract: daily 06:00
  - analyse: daily 07:00 (post-extract)
  - synthesise: Tue/Thu 08:00
- **BLOCKER — DB access in runner:** `wiki-jobs` runner uses `--permission-mode acceptEdits`, blocking `psql`/`curl` in extract/analyse jobs. Fix: add `Bash(PGPASSWORD=* psql -h localhost*)` and `Bash(curl -s http://localhost:3000/*)` to `apps/wiki-jobs/.claude/settings.json` (or project root `.claude/settings.json`) allowlist. See extract run 2026-04-23.

## Extract runs
_(jobs append timestamped entries here)_

### 2026-04-23T06:00 — first automated run

**Pages visited:** all 8 in `wiki/00-processing/`
- `crypto/yield-positions.md` (updated: 2026-04-23)
- `finance/transactions.md` (updated: 2026-04-23)
- `genomics/lifecode-gx.md` (updated: 2026-04-23)
- `health/apple-health.md` (updated: 2026-04-23)
- `health/oura.md` (updated: 2026-04-23)
- `health/randox.md` (updated: 2026-04-23)
- `health/strong.md` (updated: 2026-04-23)
- `photos/apple-photos.md` (updated: 2026-04-23)

**New rows discovered:** UNKNOWN — database queries could not execute.

**Blocker (infra):** The wiki-jobs runner spawns Claude with `--permission-mode acceptEdits`. This mode auto-accepts file edits but does NOT grant permission for Bash commands (`psql`, `curl`). Every database query triggered a user-approval prompt, making unattended 06:00 runs impossible.

**Pages touched:** 0 (no edits made — cannot verify new data without DB access).

**Open questions raised:**
- Change runner permission mode to `bypassPermissions` (risky, broad) OR add specific allowlist entries for `psql` and `curl http://localhost:*` in `.claude/settings.json`. Recommend the allowlist approach.
- All pages were initialised `2026-04-23` — first true diff run will be tomorrow once a DB-accessible run establishes baselines.

---

### 2026-04-23T — second run (DB access via Node.js postgres module)

**Method:** psql not installed; used `node -e` with `/Users/gcd/Repositories/main/personal-data-store/node_modules/postgres` (the `postgres` npm package). Queries ran successfully.

**Pages touched:** all 8 in `wiki/00-processing/` — all edited.

**New rows discovered per source:**

| Source | Table | Rows |
|--------|-------|------|
| yield_positions | yield_positions | 0 |
| portfolio_snapshots | portfolio_snapshots | 0 |
| transactions | transactions | 0 |
| health_metrics (apple_health) | health_metrics | 0 |
| health_metrics (oura) | health_metrics | 0 |
| health_metrics (randox) | health_metrics | 0 |
| workouts (strong) | workouts | 0 |
| genomics_variants | genomics_variants | 0 |
| genomics_profiles | genomics_profiles | 0 |
| photos | photos | 0 |
| wallets | wallets | 0 |

**Finding: all processing tables are empty.** The DB schema exists and is accessible. The `connector_runs` table has 15 rows — all `connector=crypto`, all `status=success`, all `records_synced=0`. Every other table: 0 rows. No data has been imported yet.

**Schema drift found and corrected across all pages:**

| Page | Wrong column | Correct column |
|------|-------------|----------------|
| yield-positions.md | `position_name` | `name` |
| yield-positions.md | `balance_usd` | `value_usd` |
| yield-positions.md | `apy_pct` | `apy` |
| yield-positions.md | `annualised_yield_usd` | not stored — compute as `value_usd * apy / 100` |
| yield-positions.md | `active` (flag) | column does not exist |
| apple-health.md, oura.md, randox.md | `metric_name` | `metric_type` |
| apple-health.md, oura.md, randox.md | `date` | `recorded_at` |
| randox.md | `reference_range` | not a column — check `metadata` jsonb |
| strong.md | `date` (workouts) | `started_at` |
| genomics/lifecode-gx.md | `profile` | `profile_id` (UUID FK to genomics_profiles) |
| genomics/lifecode-gx.md | `variant` | `genotype` |
| genomics/lifecode-gx.md | `interpretation` | not a column — check `metadata` jsonb |
| photos/apple-photos.md | `ai_caption` | not a column — check `metadata` jsonb |

**Open questions raised:**
- Why is the crypto connector running successfully but syncing 0 records? Is it misconfigured, or waiting for credentials/API keys?
- All processing tables are empty — when will the historical data imports be run? Priority order: Randox (goal-critical), Oura (automated), transactions (goal-critical), Apple Health (manual), Strong (manual), Lifecode (one-time), Photos (lower priority).
- The infra blocker from run 1 is partially resolved for this run (Node.js postgres) but `psql` and `curl` are still blocked. If the runner needs to query via the API (`localhost:3000`), `curl` must be allowlisted. Recommend adding to `.claude/settings.json` allowlist: `Bash(node -e *)` or specific Node script paths.

---

### 2026-04-28T06:00 — extract run (docker exec psql)

**Method:** `docker exec <postgres-container> psql -U pds -d personal_data_store` — queries executed successfully.

**Pages touched (all updated):**
- `health/apple-health.md` (updated: 2026-04-23 → 2026-04-28)
- `health/oura.md` (updated: 2026-04-23 → 2026-04-28)
- `health/randox.md` (updated: 2026-04-23 → 2026-04-28)
- `health/strong.md` (updated: 2026-04-23 → 2026-04-28)
- `finance/transactions.md` (updated: 2026-04-23 → 2026-04-28)
- `crypto/yield-positions.md` (updated: 2026-04-23 → 2026-04-28)
- `genomics/lifecode-gx.md` (updated: 2026-04-23 → 2026-04-28)
- `photos/apple-photos.md` (updated: 2026-04-23 → 2026-04-28)
- `meta/connectors.md` (updated: 2026-04-24 → 2026-04-28)

**New rows discovered per source (since 2026-04-23):**

| Source | Table | Rows 2026-04-23 | Rows 2026-04-28 | Delta |
|---|---|---|---|---|
| apple_health | health_metrics | 0 | 73,641 | +73,641 |
| apple_health | workouts | 0 | 1,471 | +1,471 |
| aura | health_metrics | 0 | 23 | +23 |
| oura | health_metrics | 0 | 0 | 0 |
| randox | health_metrics | 0 | 63 | +63 |
| strong | workouts | 0 | 59 | +59 |
| — | transactions | 0 | 10,943 | +10,943 |
| — | yield_positions | 0 | 27 | +27 |
| — | portfolio_snapshots | 0 | 1,714 | +1,714 |
| — | wallets | 89 | 89 | 0 |
| — | genomics_variants | 0 | 230 | +230 |
| — | genomics_profiles | 0 | 1 | +1 |
| — | subscriptions | 0 | 465 | +465 |

**Schema drift found:**

| Finding | Detail |
|---|---|
| `photos` table DROPPED | Table no longer exists in DB. `import-photos.ts` and `import-photos.py` also deleted. Media domain restructured. |
| `source = 'oura'` → `source = 'aura'` | Oura connector now writes `source='aura'`. 0 rows under `oura`, 23 under `aura`. Affects query compatibility. |
| APY field NULL in yield_positions | All 27 yield position rows have NULL `apy`. Annualised yield cannot be computed from DB. |
| New tables: film_reviews (59), nutrition_entries (0), personality_assessments (1), supplements (0) | Not covered by any processing page. Added to ROADMAP below. |
| subscriptions connector now syncing | 465 rows in subscriptions table. Schema: name, amount, currency, frequency, status, confidence, first_seen, last_seen, next_expected, category, metadata. |

**Connector state changes:**
- `aura`: 15 records (2026-04-24) → 23 records (2026-04-28), 60 total runs
- `crypto`: 567 records (2026-04-24) → 1,714 records (2026-04-28), 1,392 total runs
- `subscriptions`: 0 records (2026-04-24) → 465 records (2026-04-28) — **newly active**
- `gmail`: 75 failed (2026-04-24) → 348 failed (2026-04-28) — still broken, worsening

**Open questions raised:**
- `aura` vs `oura` source naming — intentional? Should be normalised for historical queries.
- APY field NULL — DeFiLlama or manual APY entry needed before yield goal analysis is possible.
- 5 genomics profiles missing (only 1 of 6 restored post-wipe). Source files on disk?
- Randox: hsCRP, folate, vitamin D not in 2025-11-18 import — extraction gap or panel scope?
- Strong: April 2026 sessions missing — last import cutoff 2026-03-31.
- New tables (film_reviews, nutrition_entries, personality_assessments, supplements) need processing pages.
- gmail 401: 348 failures and counting. OAuth re-auth blocked on human action.

**ROADMAP additions (schema drift — new tables):**
- Add `00-processing/media/film-reviews.md` — 59 rows exist, purpose unclear vs photos domain.
- Add `00-processing/health/nutrition.md` — `nutrition_entries` table exists, 0 rows, connector unclear.
- Add `00-processing/health/supplements.md` — `supplements` table exists, 0 rows.
- Add `00-processing/meta/personality.md` — `personality_assessments` table exists, 1 row.

### 2026-05-01T06:00 — extract run

**Method:** `docker exec personal-data-store-postgres-1 psql -U pds -d personal_data_store`.

**Pages touched:**
- `health/oura.md` (updated: 2026-04-29 → 2026-05-01) — +5 rows, coverage extended to 2026-05-01
- `crypto/yield-positions.md` (updated: 2026-04-29 → 2026-05-01) — new snapshot 2026-05-01; Jupiter Lend USDT down ~$41K
- `meta/connectors.md` (updated: 2026-04-29 → 2026-05-01) — counters refreshed; subscriptions dedup recorded

**Pages with no material change (logged, not bumped):**
- `health/apple-health.md` — health_metrics 73,641 (unchanged), workouts 1,471 (unchanged); apple_health import still capped at 2026-04-06 / 2026-04-07
- `health/randox.md` — 63 rows (unchanged); next panel still pending
- `health/strong.md` — 59 sessions (unchanged); still capped at 2026-03-31 — April + late-April sessions still missing one month later
- `finance/transactions.md` — 10,943 rows (unchanged); no new transactions imported since 2026-04-28
- `genomics/lifecode-gx.md` — 230 variants / 1 profile (unchanged)
- `photos/apple-photos.md` — table still dropped
- `meta/goals.md` — `documents` row not modified

**New rows discovered per source (since 2026-04-29):**

| Source | Table | 2026-04-29 | 2026-05-01 | Delta |
|---|---|---|---|---|
| apple_health | health_metrics | 73,641 | 73,641 | 0 |
| apple_health | workouts | 1,471 | 1,471 | 0 |
| aura | health_metrics | 25 | 30 | +5 |
| randox | health_metrics | 63 | 63 | 0 |
| strong | workouts | 59 | 59 | 0 |
| — | transactions | 10,943 | 10,943 | 0 |
| — | yield_positions | 36 | 45 | +9 (1 new snapshot) |
| — | portfolio_snapshots | 1,993 | 2,589 | +596 |
| — | wallets | 89 | 89 | 0 |
| — | genomics_variants | 230 | 230 | 0 |
| — | genomics_profiles | 1 | 1 | 0 |
| — | subscriptions | 465 | 75 | **−390** (dedup) |
| — | film_reviews | 59 | 59 | 0 |
| — | nutrition_entries | 0 | 0 | 0 |
| — | personality_assessments | 1 | 1 | 0 |
| — | supplements | 0 | 0 | 0 |

**Schema drift / anomalies:**
- `subscriptions` row count dropped 465 → 75 between 2026-04-28 and 2026-05-01. Connector cumulative `records_synced=834`. Strong indicator of a dedup or rebuild pass on the table — confirm intent and add unique constraint if not present.
- `aura` connector still emitting **only** `activity_score` and `sleep_score` three days after the 2026-04-28 v2 upgrade. The expanded endpoints (readiness, HRV, vo2_max, cardiovascular_age, sleep details, heartrate, workouts, sessions, …) are not landing.

**Open questions raised:**
- Why is `aura` still only writing 2 metric types after the v2 endpoint upgrade? Inspect `connector_runs` payload / `SyncResult.errors` for per-endpoint failures. **Blocks `sleep-vs-activity.md` and `body-composition-regression.md` analysis upgrades.**
- `subscriptions` 465 → 75: was this an intentional dedup, and is there a unique constraint preventing recurrence? If not, table will re-bloat next run.
- `apple_health` import has not advanced past 2026-04-06 — webhook still inactive 8 days later.
- `transactions` flat at 10,943 since 2026-04-28 — no new CSV imports for 3 days. Manual cadence question for the user.
- `strong` still capped at 2026-03-31 — one full month of gym sessions now missing. Blocks gym-frequency tracking against goal.
- `gmail` failures: 348 → 583 (+235 in 3 days). Still no OAuth re-auth.
- New tables (`film_reviews`, `nutrition_entries`, `personality_assessments`, `supplements`) still have no processing pages — flagged in 2026-04-28 run, not actioned.

---

### 2026-05-03T06:00 — extract run

**Method:** `docker exec personal-data-store-postgres-1 psql -U pds -d personal_data_store`.

**Pages touched:**
- `health/apple-health.md` (updated: 2026-04-28 → 2026-05-03) — +651,700 rows; new `heart_rate_Avg/Min/Max` continuous-HR feed; coverage extended to 2026-05-02; metric-type table rewritten.
- `health/oura.md` (updated: 2026-05-01 → 2026-05-03) — **expanded v2 endpoints now landing**; +13,271 rows; 16 workouts; coverage anchor extended back to 2024-09-21 via `ring_configuration`. Silent-failure flag from prior runs cleared.
- `health/randox.md` (updated: 2026-04-28 → 2026-05-03) — 3 missing historical panels imported (2024-06-27, 2024-08-05, 2025-04-01); 63 → 194 rows; 63 → 83 distinct metric types; full ApoB and hsCRP trajectories now in DB.
- `crypto/yield-positions.md` (updated: 2026-05-01 → 2026-05-03) — new 2026-05-02 snapshot with **APY populated for all 9 positions**; Coinbase $1.146M → $1.25M; Jupiter Lend USDT $227K → $261K; annualised yield now ~$131,747 USD + £10,795 GBP/yr (computable from DB for first time).
- `meta/connectors.md` (updated: 2026-05-01 → 2026-05-03) — counters refreshed; aura cumulative 30 → 13,317; gmail failures 583 → 651.

**Pages with no material change (logged, not bumped):**
- `health/strong.md` — 59 sessions (unchanged); now **33 days stale** at 2026-03-31.
- `finance/transactions.md` — 10,943 rows (unchanged); flat for **25 days** since 2026-04-08.
- `genomics/lifecode-gx.md` — 230 variants / 1 profile (unchanged).
- `photos/apple-photos.md` — `photos` table still dropped.
- `meta/goals.md` — `documents` row not modified.

**New rows discovered per source (since 2026-05-01):**

| Source | Table | 2026-05-01 | 2026-05-03 | Delta |
|---|---|---|---|---|
| apple_health | health_metrics | 73,641 | 725,341 | **+651,700** |
| apple_health | workouts | 1,471 | 1,471 | 0 |
| aura | health_metrics | 30 | 13,301 | **+13,271** |
| aura | workouts | 0 | 16 | +16 |
| randox | health_metrics | 63 | 194 | +131 (3 panels) |
| strong | workouts | 59 | 59 | 0 |
| — | transactions | 10,943 | 10,943 | 0 |
| — | yield_positions | 45 | 54 | +9 (1 new snapshot, APY populated) |
| — | portfolio_snapshots | 2,589 | 2,901 | +312 |
| — | wallets | 89 | 89 | 0 |
| — | genomics_variants | 230 | 230 | 0 |
| — | genomics_profiles | 1 | 1 | 0 |
| — | subscriptions | 75 | 75 | 0 (cumulative records_synced 834 → 998) |
| — | film_reviews | 59 | 59 | 0 |
| — | nutrition_entries | 0 | 0 | 0 |
| — | personality_assessments | 1 | 1 | 0 |
| — | supplements | 0 | 0 | 0 |

**Schema drift / anomalies:**
- `apple_health.health_metrics`: new identifier casing — `heart_rate_Avg/Min/Max` (capitalised, 208,667 rows each, 2026-04-25 onward). The prior lowercase `heart_rate_avg/min/max` series ends 2024-05-27. Likely Health Auto Export schema change. Analyses joining HR series must UNION across casings or normalise to lowercase.
- `apple_health.health_metrics`: `walking_running_distance` (3,346 rows, post-2024-07) and `walking_and_running_distance` (3,212 rows, pre-2024-07) co-exist — same metric, renamed at iOS update. Same UNION issue.
- `randox.health_metrics`: 2025-11-18 panel **does not contain** lipid panel (LDL/HDL/triglycerides/total cholesterol), hsCRP, HbA1c, glucose, insulin, folic acid, or vitamin D — even though earlier panels do. Either panel scope differed or PDF extraction missed pages. Needs human verification.
- `yield_positions.apy`: populated only for 2026-05-02 snapshot; earlier 5 snapshots still NULL. Forward-fill confirmed; back-fill TBD.

**Open questions raised:**
- ApoB jumped 88 (2025-04-01) → 113 (2025-11-18). LDLR-double-hit goal-critical. Needs root-cause: diet, training, supplement, or measurement variability?
- Why is the Apple Health workouts feed 26 days behind the metrics feed (workouts capped 2026-04-07, metrics through 2026-05-02)?
- Did the Apple Health metrics jump come from the Health Auto Export webhook finally functioning, or a manual export run? If manual, when does the next refresh land?
- Coinbase Earn position $1.146M → $1.25M between 2026-05-01 and 2026-05-02 — manual entry refresh, real deposit, or pricing artefact?
- Will the connector back-fill APY into the 5 earlier yield_positions snapshots, or only forward-fill from 2026-05-02 onward?
- Strong stalled 33 days at 2026-03-31. Transactions stalled 25 days at 2026-04-08. Both are manual import paths — is the user pausing imports, or has the manual job lapsed?
- 2025-11-18 Randox panel missing key markers (hsCRP, lipids, HbA1c, glucose, insulin, vit D, folate). Re-extract PDF or confirm panel scope?

---

### 2026-05-04T06:00 — extract run

**Method:** `docker exec personal-data-store-postgres-1 psql -U pds -d personal_data_store`.

**Pages touched:**
- `health/apple-health.md` (updated: 2026-05-03 → 2026-05-04) — +105,518 rows; heart_rate_Avg/Min/Max advanced to 242,044 each; coverage extended to 2026-05-03.
- `health/oura.md` (updated: 2026-05-03 → 2026-05-04) — +1,000 rows; heart_rate 12,744 → 13,673; ring_configuration 11 → 19; workouts 16 → 21; coverage extended to 2026-05-04 via personal_info / ring_configuration.
- `crypto/yield-positions.md` (updated: 2026-05-03 → 2026-05-04) — new 2026-05-03 snapshot (63 rows total); Coinbase $1.25M reverted to $1.146M (one-day artefact); APY now populated on 2026-05-02 AND 2026-05-03 snapshots; total deployed $3,649,367 USD + £254,000 GBP; annualised yield ~$135,043 USD + £10,795 GBP.
- `meta/connectors.md` (updated: 2026-05-03 → 2026-05-04) — counters refreshed; aura cumulative 13,317 → 14,322; gmail failures 651 → 675; subscriptions cumulative 998 → 1,039.

**Pages with no material change (logged, not bumped):**
- `health/randox.md` — 194 rows (unchanged); next panel still pending.
- `health/strong.md` — 59 sessions (unchanged); now **34 days stale** at 2026-03-31.
- `finance/transactions.md` — 10,943 rows (unchanged); flat for **26 days** since 2026-04-08.
- `genomics/lifecode-gx.md` — 230 variants / 1 profile (unchanged).
- `photos/apple-photos.md` — `photos` table still dropped.
- `meta/goals.md` — `documents` row not modified.

**New rows discovered per source (since 2026-05-03):**

| Source | Table | 2026-05-03 | 2026-05-04 | Delta |
|---|---|---|---|---|
| apple_health | health_metrics | 725,341 | 830,859 | **+105,518** |
| apple_health | workouts | 1,471 | 1,471 | 0 |
| aura | health_metrics | 13,301 | 14,301 | +1,000 |
| aura | workouts | 16 | 21 | +5 |
| randox | health_metrics | 194 | 194 | 0 |
| strong | workouts | 59 | 59 | 0 |
| — | transactions | 10,943 | 10,943 | 0 |
| — | yield_positions | 54 | 63 | +9 (1 new snapshot, APY populated) |
| — | portfolio_snapshots | 2,901 | 3,047 | +146 |
| — | wallets | 89 | 89 | 0 |
| — | genomics_variants | 230 | 230 | 0 |
| — | genomics_profiles | 1 | 1 | 0 |
| — | subscriptions | 75 | 75 | 0 (cumulative records_synced 998 → 1,039) |
| — | film_reviews | 59 | 59 | 0 |
| — | nutrition_entries | 0 | 0 | 0 |
| — | personality_assessments | 1 | 1 | 0 |
| — | supplements | 0 | 0 | 0 |

**Schema drift / anomalies:**
- None new this run. The `heart_rate_Avg`/`heart_rate_avg` casing split flagged 2026-05-03 still applies.

**Open questions raised:**
- Coinbase $1.146M → $1.25M (2026-05-02) → $1.146M (2026-05-03): the prior-day question is now answered as a manual-entry artefact, not a deposit. Confirm canonical balance and whether the manual-entry source needs a guard against day-only blips before they propagate into yield-gap totals.
- Apple Health continuous-HR feed continues to advance (~33K rows/day per metric). What's the rolling-window policy — will earlier history (pre-2026-04-25) ever be back-filled, or is this a forward-only stream?
- Strong now 34 days stale (was 33). Transactions now 26 days flat (was 25). Both manual paths still unattended.
- gmail failures still climbing (+24/day). OAuth re-auth still pending human action.
- New tables (`film_reviews`, `nutrition_entries`, `personality_assessments`, `supplements`) still without processing pages — flagged 2026-04-28, 6 days unactioned.

---

## Analyse runs — lint findings
_(jobs append timestamped entries here)_

### 2026-04-28T07:00 — first analyse run

**Pages refreshed:** all 5 in `wiki/10-analysis/`

**Data source:** `docker exec personal-data-store-postgres-1 psql -U pds -d personal_data_store`

**Key findings per page:**

| Page | Status | Key number |
|---|---|---|
| apob-trajectory | Partial — 1 of 4 panels loaded | ApoB 113 mg/dL (2025-11-18), target <90 |
| body-composition-regression | Partial — no baseline window, no sleep | Steps 10,188/day (goal 11K+); gym ~1.5×/wk (goal 2×) |
| monthly-spend | Blocked — categorisation and dedup needed | GBP outflows Jan–Mar £5K–£8K/mo (incomplete figure) |
| yield-gap | Blocked — APY NULL for all positions | Portfolio $3,902,453 deployed; annualised yield not computable |
| sleep-vs-activity | Blocked — no date overlap | Gym ends 2026-03-31; sleep starts 2026-04-17 |

---

#### Lint: orphans
No orphan analysis pages found. All 5 pages in `10-analysis/` are linked from at least one synthesis page.

#### Lint: contradictions

1. **apob-trajectory.md vs goal doc**: Page previously stated "four panel points exist" — only 1 panel (2025-11-18) is loaded in the DB. Corrected in this run.
2. **yield-gap.md vs goal doc**: Page previously stated "$130K current yield" — this figure cannot be verified from DB (APY NULL). Corrected to note figure is unverifiable.
3. **SQL schema drift (all analysis pages)**: Queries used wrong column names inherited from initial schema design. Corrected in this run:
   - `metric_name` → `metric_type`
   - `date` → `recorded_at::date` (health_metrics)
   - `date` → `started_at::date` (workouts)
   - `source='oura'` → `source='aura'`
   - `annualised_yield_usd` → `value_usd * apy / 100` (APY is currently NULL)
   - `WHERE active = true` → removed (no `active` column in yield_positions)
   - Steps metric: `metric_type='steps'` → `metric_type='step_count'`

#### Lint: missing citations
All 5 analysis pages have `sources:` frontmatter. No missing citations.

#### New open questions raised

- **Strong: April 2026 sessions missing** — last import 2026-03-31. Import needs re-run to include April sessions before sleep-vs-activity comparison is possible.
- **Aura historical sleep missing** — only 11 records from 2026-04-17. No sleep data for the Apr–Nov 2025 regression window.
- **Body composition baseline undefined** — need BCA history (pre-Apr-2025) to define "best composition" window.
- **APY not stored in yield_positions** — blocks all yield goal analysis. DeFiLlama per-snapshot import or manual entry required.
- **Transaction deduplication** — ~9 duplicate transaction pairs confirmed in Feb 2026. Unique constraint by `(account_id, source_ref)` should prevent new dupes but historical dupes need a one-time clean.
- **Monthly spend figure unreliable** — majority of transactions have NULL category. Until categorisation backlog is resolved, the £19K/mo goal cannot be assessed from the DB.

## Analyse runs — lint findings (continued)

### 2026-04-29T07:00 — second analyse run

**Trigger:** Two processing pages updated since last analyse run (2026-04-28):
- `crypto/yield-positions.md` (updated: 2026-04-28 → 2026-04-29)
- `00-processing/health/oura.md` (updated: 2026-04-28 → 2026-04-29)

**Pages refreshed:**

| Page | Change |
|---|---|
| `yield-gap.md` | Snapshot date 2026-04-27 → 2026-04-28; total corrected to $3,647,754 USD + £254,000 GBP (Revolut GBP was incorrectly summed as USD); Jupiter USDT $268,818 → $268,836; Jupiter WSOL $73,432 → $72,715; row count 27 → 36 (4 snapshots). APY still NULL. |
| `sleep-vs-activity.md` | Sleep records 11 → 12; coverage extends to 2026-04-28; activity_score row added (13 records); noted Oura v2 connector upgrade (2026-04-28) — HRV, readiness, cardiovascular_age expected next run; 21-month sleep gap (2024-07 to 2026-04-16) documented; added missing `## Links up` section. |

**Pages not refreshed (source unchanged since 2026-04-28):**
- `apob-trajectory.md` — `randox.md`, `lifecode-gx.md` both 2026-04-28 (unchanged)
- `body-composition-regression.md` — `apple-health.md`, `strong.md` both 2026-04-28 (unchanged)
- `monthly-spend.md` — `transactions.md` 2026-04-28 (unchanged)

#### Lint: orphans
No orphan analysis pages. All 5 pages in `10-analysis/` linked from at least one synthesis page.

#### Lint: contradictions
One stale-figure contradiction corrected this run:
- **yield-gap.md**: total $3,902,453 (GBP treated as USD parity) vs processing page's explicit note that Revolut is GBP face value. Corrected to $3,647,754 USD + £254,000 GBP.

#### Lint: missing citations
All 5 analysis pages have `sources:` frontmatter. `sleep-vs-activity.md` was missing `## Links up` — added this run.

#### New open questions raised
- **Oura expanded metrics not yet in DB** (as of 2026-04-29): `sleep_hrv_avg`, `readiness_score`, `cardiovascular_age`, `vo2_max` all expected after next connector run. Verify they appear — if absent, check `connector_runs` for errors from expanded endpoint set.
- **21-month sleep gap (2024-07 to 2026-04-16)**: body composition regression window has no sleep coverage. Historical Oura export import path unresolved.
- **Yield total multi-currency**: $3,647,754 USD + £254,000 GBP cannot be reliably summed without a rate table. Once `amount_gbp_equivalent` (or USD equivalent) is added to yield_positions, single-currency total becomes computable.

### 2026-05-02T07:00 — third analyse run

**Trigger:** Two processing pages updated since last analyse run (2026-04-29):
- `crypto/yield-positions.md` (updated: 2026-04-29 → 2026-05-01)
- `health/oura.md` (updated: 2026-04-29 → 2026-05-01)

**Pages refreshed:**

| Page | Change |
|---|---|
| `yield-gap.md` | Snapshot 2026-04-28 → 2026-05-01; row count 36 → 45 (5 snapshots × 9 positions); USD subtotal $3,647,754 → $3,606,573 (−$41,181); Jupiter Lend USDT $268,836 → $227,630 (−$41,206) is the entire delta; Revolut £254,000 unchanged; APY still NULL across the board. Added Δ column vs prior snapshot and a new open question about the Jupiter Lend USDT drop. |
| `sleep-vs-activity.md` | Aura sleep 12 → 15, activity 13 → 16 (coverage extended to 2026-05-01); date overlap with Strong still zero (Strong capped at 2026-03-31, now 31 days stale); upgraded the expanded-Oura-metrics note from "expected next run" to **confirmed silent failure** — `sleep_hrv_avg`, `readiness_score`, `cardiovascular_age`, `vo2_max`, continuous heart rate all still absent 4 days post-upgrade. |
| `body-composition-regression.md` | Date bumped 2026-04-28 → 2026-05-02; numbers unchanged. Source `oura.md` updated but its new aura rows (2026-04-30/05-01) fall outside the Apr–Nov 2025 regression window, so no regression-window numbers move. |

**Pages not refreshed (sources unchanged since prior analyse run):**
- `apob-trajectory.md` — `randox.md` and `lifecode-gx.md` both still 2026-04-28.
- `monthly-spend.md` — `transactions.md` still 2026-04-28.

#### Lint: orphans
No orphan analysis pages. All 5 pages in `10-analysis/` are linked from at least one synthesis page (verified by grepping `10-analysis/` paths under `20-synthesis/`).

#### Lint: contradictions
None this run. The yield-gap USD subtotal change ($3,647,754 → $3,606,573) is a refresh against a new snapshot, not a contradiction — prior figure was correct for snapshot 2026-04-28.

#### Lint: missing citations
All 5 analysis pages have `sources:` frontmatter. ✓

#### New / sharpened open questions
- **Jupiter Lend USDT dropped $41,206 between 2026-04-28 and 2026-05-01** — withdrawal, redeployment, or pricing artefact? Cross-check `portfolio_snapshots` for the same wallet/day. Goal-relevant: this is the largest single position movement since snapshots began.
- **Strong stalled 31 days** — last gym session 2026-03-31, no advance through 2026-05-01. Either the user has paused training or the import has stalled. Affects `sleep-vs-activity.md` (no overlap window) and `body-composition-regression.md` (current cadence unmeasurable). Needs human disambiguation before either analysis can move.
- **Expanded Oura connector silent failure confirmed** — 4 days post-upgrade, only `sleep_score` and `activity_score` are landing. `connector_runs` reports success. Inspect per-endpoint `SyncResult.errors`. Blocks HRV-vs-training analysis indefinitely.
- **Goal-doc baseline drift**: goals-h2-2026 cites "$130K current yield" — still unverifiable from DB. With APY NULL across 5 snapshots now, this is a structural blocker for the yield goal, not a transient gap.

### 2026-05-04T07:00 — fourth analyse run

**Trigger:** Three processing pages updated since last analyse run (2026-05-03):
- `health/oura.md` (updated: 2026-05-03 → 2026-05-04)
- `health/apple-health.md` (updated: 2026-05-03 → 2026-05-04)
- `crypto/yield-positions.md` (updated: 2026-05-03 → 2026-05-04)

`finance/transactions.md` (2026-04-28), `health/randox.md` (2026-05-03), `health/strong.md` (2026-04-28), `genomics/lifecode-gx.md` (2026-04-28) all unchanged.

**Pages refreshed:**

| Page | Change |
|---|---|
| `sleep-vs-activity.md` | Date 2026-05-03 → 2026-05-04. Aura sleep_score 16 → 17, sleep_hrv_avg 7 → 8, readiness 8 → 9, cardiovascular_age 8 → 9; Aura workouts 0 → 21 (new — opens parallel Aura-workout × sleep test path that bypasses Strong stall). Strong unchanged at 59 sessions, now 34 days idle. Method updated to use `source IN ('strong','aura')` for training-day flag. |
| `yield-gap.md` | Date 2026-05-03 → 2026-05-04. New 2026-05-03 snapshot. Coinbase reverted $1.25M → $1.146M (one-day artefact, not a withdrawal); Coinbase APY 3.50 → 4.10 (DefiLlama refresh, replaces manual default); Lido APY 2.56 → 2.375. USD subtotal: deployed $3,744K → $3,649K (−$95K) but annualised yield $131,753 → $135,043 (+$3,290) due to APY moves. Gap to $170K narrowed $38,247 → $34,957. |
| `body-composition-regression.md` | Date 2026-05-03 → 2026-05-04. **Material finding** — pulled in waist/weight/BMI for all 4 Randox panels (was 1). 2025-04-01 anchored as "best window" (waist 80cm, weight 79.8kg, BMI 21.9). 2025-11-18 regression confirmed: waist +12cm at +1.2kg weight → recomp loss, not weight gain. Common-driver hypothesis with ApoB rebound now stronger. Added `randox.md` to `sources:` frontmatter. |

**Pages not refreshed (sources unchanged since prior analyse run):**
- `apob-trajectory.md` — `randox.md` (2026-05-03) and `lifecode-gx.md` (2026-04-28) both unchanged since last refresh of this analysis page (2026-05-03).
- `monthly-spend.md` — `transactions.md` still 2026-04-28 (unchanged for 6 days).

#### Lint: orphans
No orphan analysis pages. All 5 pages in `10-analysis/` are referenced from at least one synthesis page (verified via `grep -r 10-analysis/<slug> 20-synthesis/`).

#### Lint: contradictions
- **Goal-doc baseline drift (sharpened, not new):** `docs/goals-h2-2026.md` cites "$130K current yield" as the baseline. DB-verified yield is now $135,043 USD/yr (+£10,795 GBP/yr) on the 2026-05-03 snapshot — drift of ~$5K above the cited baseline. Not a contradiction in the analysis layer, but the goal-doc figure is stale; flag for next synthesise run.
- **Coinbase value oscillation:** `yield-gap.md` reported $1.25M on 2026-05-02; this run reports $1.146M on 2026-05-03. Per extract job 2026-05-04, this is a manual-entry artefact, not a real movement — but successive analyse refreshes are now propagating the artefact into the headline yield figure (~$4K wobble). Not a within-page contradiction; flagged as a *data-source* contradiction needing a guard at the manual-entry layer.

#### Lint: missing citations
All 5 analysis pages have `sources:` frontmatter. `body-composition-regression.md` previously cited `randox.md` only via inline links — added to frontmatter `sources:` this run since it now drives the body-comp anchor table.

#### New / sharpened open questions
- **Aura workouts (21 sessions, 2026-04-25 → 2026-05-03)**: classification unknown. If they're walks rather than strength sessions, they're not a clean Strong substitute for HRV-vs-load tests. Need `workout_type` / activity classification check before treating Aura-workout days as training days.
- **Coinbase manual-entry guard**: $1.146M ↔ $1.25M oscillation between snapshots is now visible in two consecutive analyse runs. Recommend a dedup / freshness guard at the manual-entry layer before the wobble propagates further.
- **Lido stETH APY drop 2.56 → 2.375 in one day**: real ETH staking yield move or DefiLlama feed artefact? Worth a sanity check against on-chain stETH rebase rate.
- **Apple Health BCA back-fill into body-comp regression**: 129 rows each of `body_fat_percentage` and `lean_body_mass` extend to 2026-01-13 but are still not joined into the analysis. Doing so would give intra-window resolution between the 2025-04 and 2025-11 Randox panels — currently the regression has no shape between those two dots.
- **Apple Health `weight` ends 2024-06-17** — gap predates the regression window; not blocking anything immediately but worth understanding (device change? import path lapsed?).

---

## Synthesise runs
_(jobs append timestamped entries here)_
