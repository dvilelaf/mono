---
layer: processing
domain: meta
updated: 2026-04-24
sources:
  - table: connector_runs
    query: SELECT connector, status, records_synced, started_at, error FROM connector_runs ORDER BY started_at DESC
---

# Connectors

## TL;DR
7 connectors registered. Live state as of 2026-04-24: `crypto` and `aura` syncing records. `gmail` failing 401 on token refresh (75 failed runs). `revolut`, `subscriptions`, `digest`, `myfitnesspal` running without error but `records_synced=0` — API wired up but no data flowing.

## Live state

```sql
SELECT connector, status, SUM(records_synced) total, COUNT(*) runs, MAX(started_at)::date last_run
FROM connector_runs
GROUP BY connector, status
ORDER BY connector;
```

| connector | status | records_synced | runs | last_run | note |
|---|---|---|---|---|---|
| aura (Oura) | success | 15 | 12 | 2026-04-24 | Working (new connector; migrating from `source=oura` imports) |
| crypto | success | 567 | 300 | 2026-04-24 | Working — the only consistently productive connector |
| digest | success | 0 | 6 | 2026-04-24 | Placeholder / not yet populated |
| gmail | failed | 0 | 75 | 2026-04-24 | **401 token refresh failures.** OAuth needs re-auth |
| myfitnesspal | success | 0 | 6 | 2026-04-23 | Scheduled but not pulling data |
| revolut | success | 0 | 3 | 2026-04-24 | No records synced — API wired, no pull logic? |
| subscriptions | success | 0 | 3 | 2026-04-24 | Not producing rows |

## Missing data — what's in the DB vs memory

The DB was truncated on 2026-04-23 09:09 UTC by a test suite run hitting the prod DB (see [the prod-wipe incident](../../../tests/helpers/setup.ts) — guard added). Re-imports done since:

| Table | Current rows | Prior (memory) | Gap | Re-import path |
|---|---|---|---|---|
| health_metrics | 44,627 | 53,373 | ~8,700 | Missing 2020–2024 Apple Health JSON; check for additional exports |
| workouts | 1,530 | 1,540 | ~10 | Effectively restored |
| transactions | 1,659 | ~10,400 | ~8,700 | Revolut Personal CSV sits on disk (`~/Downloads/account-statement_2017-11-11_2026-04-08*.csv`) — needs frontend connector upload. Wise + Revolut Savings need fresh export. |
| wallets | 89 | 89 | 0 | ✓ restored |
| photos | 0 | 47,549 | **47,549** | Needs `osxphotos export` rerun + `import-photos.py` |
| genomics_variants | 0 | 230 | **230** | Lifecode Gx panel source not located on disk — check Notion/Drive |
| genomics_profiles | 0 | 6 | 6 | Same as above |
| yield_positions | 0 | 8 | 8 | Rebuilds via `crypto` connector + `snapshot-yield-positions` cron |
| portfolio_snapshots | 0 | 4,992 (historical) | permanent loss | API APY snapshots cannot be reconstructed |

## Known gotchas
- `records_synced=0 + status=success` is the pattern to watch — it's what hid the prior import failures. A "success" without records should be investigated per-connector.
- `gmail` token refresh failing doesn't hard-fail the cron; it just increments failure count. Needs its own health check.

## Goal linkage
- Blocks [data-automation](../../20-synthesis/goals/data-automation.md) goal directly.
- Silent-zero connectors (revolut, subscriptions, myfitnesspal) are the current top connector-level blocker.

## Open questions
- Why does `revolut` report success with 0 records? No CSV upload triggers it, or the puller logic is incomplete?
- Why does `digest` exist — what's its intended output?
- Can the `connector_runs` table expose a "records synced in last 7 days" metric on the frontend?
- Should a "zero-records-streak" alert be added (e.g. if a connector has reported success with 0 records for > N consecutive runs, surface it)?
