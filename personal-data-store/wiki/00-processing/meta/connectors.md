---
layer: processing
domain: meta
updated: 2026-05-04
sources:
  - table: connector_runs
    query: SELECT connector, status, records_synced, started_at, error FROM connector_runs ORDER BY started_at DESC
---

# Connectors

## TL;DR
7 connectors registered. Live state as of 2026-05-04: `aura` continuing to land v2 endpoints (cumulative records 14,322), `crypto` healthy with APY populated for the latest two snapshots, `subscriptions` continuing to sync. `gmail` still failing (675 failed runs, up from 651). `revolut`, `digest`, `myfitnesspal` still zero records.

## Live state (verified 2026-05-04)

```sql
SELECT connector, status, SUM(records_synced) total, COUNT(*) runs, MAX(started_at)::date last_run
FROM connector_runs
GROUP BY connector, status
ORDER BY connector;
```

| connector | status | records_synced | runs | last_run | note |
|---|---|---|---|---|---|
| aura | success | 14,322 | 115 | 2026-05-04 | v2 endpoints continuing to flow; cumulative 13,317 → 14,322 in 1 day. Heart_rate, readiness, vo2_max, cardiovascular_age, sleep details, contributors all flowing. |
| crypto | success | 3,047 | 2,700 | 2026-05-04 | Working — portfolio snapshots + yield positions. APY populated for 2026-05-02 and 2026-05-03 snapshots. |
| digest | success | 0 | 52 | 2026-05-02 | Placeholder / not yet populated |
| gmail | failed | 0 | 675 | 2026-05-04 | **401 token refresh failures**, +24 since 2026-05-03. OAuth still not re-authed |
| myfitnesspal | success | 0 | 58 | 2026-05-03 | Scheduled but not pulling data |
| revolut | success | 0 | 29 | 2026-05-04 | No records synced — API wired, no pull logic? |
| subscriptions | success | 1,039 | 29 | 2026-05-04 | Cumulative 1,039 (was 998 on 2026-05-03); table still 75 rows post-dedup |

## Recovery status (post prod-wipe 2026-04-23 09:09 UTC)

| Table | Rows 2026-04-23 | Rows 2026-05-04 | Status |
|---|---|---|---|
| health_metrics | 0 | 845,354 total (830,859 apple_health + 14,301 aura + 194 randox) | ✓ Restored; daily Apple Health continuous-HR feed continuing |
| workouts | 0 | 1,551 total (1,471 apple_health + 59 strong + 21 aura) | ✓ Restored; Strong stalled at 2026-03-31 (34 days), Apple Health workouts stalled at 2026-04-07 (27 days) |
| transactions | 0 | 10,943 | ✓ Restored; **no new rows since 2026-04-08** (26 days flat) |
| wallets | 89 | 89 | ✓ Unchanged |
| photos | 0 | **TABLE DROPPED** | Schema removed — needs redesign |
| genomics_variants | 0 | 230 | ✓ Restored |
| genomics_profiles | 0 | 1 (of prior 6) | Partial — 5 profiles missing |
| yield_positions | 0 | 63 (7 snapshots × 9 positions; APY populated for 2026-05-02 and 2026-05-03) | ✓ APY pipeline live |
| portfolio_snapshots | 0 | 3,047 (12 days, through 2026-05-04) | Rebuilding; 4,992 historical permanently lost |
| subscriptions | 0 | 75 (cumulative 1,039 records via connector) | Stable post-dedup |

## Known gotchas
- `records_synced=0 + status=success` is the pattern to watch — it's what hid the prior import failures. A "success" without records should be investigated per-connector.
- `gmail` token refresh failing doesn't hard-fail the cron; it just increments failure count. Needs its own health check.
- `aura` cumulative `records_synced` jumped 30 → 13,317 in two days — heartrate-endpoint volume is the dominant component; future cumulative comparisons should split by metric_type.

## New tables (schema drift, 2026-04-28 — still no processing pages)
These tables exist in the DB but have no processing pages yet:
- `film_reviews` (59 rows) — media tracking domain
- `nutrition_entries` (0 rows)
- `personality_assessments` (1 row)
- `supplements` (0 rows)
- `subscriptions` (75 rows live; 998 cumulative via connector) — schema: name, amount, currency, frequency, status, confidence, first_seen, last_seen, next_expected, category, metadata

## Goal linkage
- Blocks data-automation goal directly.
- Silent-zero connectors (revolut, myfitnesspal) are the remaining connector-level blockers.
- `aura` now de-blocked: HRV, readiness, vo2_max, cardiovascular_age all flowing — unblocks sleep-vs-activity and body-composition-regression analyses.
- `crypto` APY de-blocked: yield-gap analysis now computable from DB.

## Open questions
- Why does `revolut` report success with 0 records? No CSV upload triggers it, or the puller logic is incomplete?
- Why does `digest` exist — what's its intended output?
- `gmail` 401: has the OAuth token been re-authed since? 651 consecutive failures suggests not.
- Should a "zero-records-streak" alert be added (e.g. if a connector has reported success with 0 records for > N consecutive runs, surface it)?
- Apple Health workouts 26 days stale, Strong 33 days stale — which manual job is responsible for advancing these and is it running?
