---
layer: synthesis
domain: cross
updated: 2026-05-03
---

# Goal: Steady stream of raw data + ongoing insight generation

## Status
Wiki extract/analyse/synthesise jobs running. **DefiLlama APY connector now live** — APY populated for all yield positions (resolves prior critical blocker). Aura v2 expanded endpoints flowing daily (HRV, readiness, cardiovascular_age, VO2 max). Apple Health continuous heart_rate now landing per-minute. Apple Health webhook still untested on home WiFi; Gmail OAuth not connected; Wise/Revolut/Amazon/Strong/Randox remain manual.

## Top blockers (ranked)
1. [apple-health-webhook-untested](../blockers/apple-health-webhook-untested.md) — smallest blocker; closes historical Aura backfill path
2. [gmail-oauth-not-set-up](../blockers/gmail-oauth-not-set-up.md) — multi-account OAuth blocks statement and receipt automation
3. [wise-api-unused](../blockers/wise-api-unused.md) — read-only key would replace one manual CSV dependency
4. [insight-generation-ad-hoc](../blockers/insight-generation-ad-hoc.md) — synthesis jobs running but cadence not codified as scheduled jobs

## Next actions
- Test Apple Health webhook on home WiFi (30 min)
- Set up Gmail OAuth across accounts
- Claim Wise read-only API key, wire to transactions importer
- Codify Tue/Thu synthesis cadence as a PDS job

## What moved
- 2026-04-24: pds-backup app live under pm2; daily 03:00 dumps; restore validated
- 2026-05-03: APY connector live (DefiLlama); resolves [apy-null-in-db](../blockers/apy-null-in-db.md)
- 2026-05-03: Aura v2 expanded endpoints confirmed flowing (was silent failure)
- 2026-05-03: Apple Health continuous heart_rate now in PDS

## Evidence trail
- Processing: [connectors](../../00-processing/meta/connectors.md), [goals](../../00-processing/meta/goals.md)
- Goals source: `documents` row, slug `goals-h2-2026` §Data & Tooling
