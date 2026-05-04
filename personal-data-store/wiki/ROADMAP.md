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

## Analyse runs — lint findings
_(jobs append timestamped entries here)_

## Synthesise runs
_(jobs append timestamped entries here)_
