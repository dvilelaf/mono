---
layer: synthesis
domain: cross
updated: 2026-04-23
---

# Goal: Steady stream of raw data + ongoing insight generation

## Status
Health (Oura, yield snapshot), Crypto (Zerion, Coinbase yield) are auto. Apple Health webhook blocked. Gmail not connected. Revolut/Wise/Amazon/Strong/Randox all manual.

## Top blockers (ranked)
1. [apple-health-webhook-untested](../blockers/apple-health-webhook-untested.md) — home-network test pending
2. [gmail-oauth-not-set-up](../blockers/gmail-oauth-not-set-up.md) — multi-account OAuth needed
3. [wise-api-unused](../blockers/wise-api-unused.md) — API exists, read-only key unclaimed
4. [insight-generation-ad-hoc](../blockers/insight-generation-ad-hoc.md) — analyses table grows manually, no recurring synthesis cadence

## Next actions
- Test Apple Health webhook on home WiFi
- Set up Gmail OAuth for all accounts
- Claim Wise read-only API key, wire up connector
- Schedule monthly spending report + quarterly health trend as recurring jobs (see `../../scripts/`)

## Evidence trail
- Source memory: [project_pds_data_sources.md](../../../../.claude/projects/-Users-gcd-Repositories-main/memory/project_pds_data_sources.md) — live status of each source
