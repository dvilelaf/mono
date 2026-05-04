# Personal Data Store

## CRITICAL: Database Safety

Never run any of the following against this database:
- `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`
- `TRUNCATE`
- `DELETE` without a `WHERE` clause
- `drizzle-kit push` (any flag), `drizzle-kit drop`, `drizzle-kit reset`
- Any ad-hoc SQL that wipes or recreates tables

Always use migrations (`db:generate` → `db:migrate`). Always import with `.onConflictDoNothing()` (or an explicit `ON CONFLICT` rule). If a destructive operation seems necessary, stop and ask the user first — assume the answer is no.

## Goals Review

**Before responding to any request, cross-reference against [docs/goals-h2-2026.md](docs/goals-h2-2026.md).**

When the user asks for analysis, recommendations, or decisions:
1. Check if the request relates to any active goal
2. If it does, frame the response in terms of progress toward that goal
3. Flag if a proposed action conflicts with a stated goal
4. Proactively surface goal-relevant insights when they emerge from data

Key goal areas: cardiovascular health (ApoB target), body composition, fertility, sleep, yield optimisation ($170K target), spending reduction (£19K/mo target), post-October income planning, data automation.

## Architecture

- **Backend**: Express API at localhost:3000 (pm2)
- **Frontend**: Next.js at localhost:3001
- **Database**: PostgreSQL + pgvector via Docker Compose
- **Key tables**: health_metrics, workouts, genomics_variants, genomics_profiles, transactions, financial_accounts, wallets, portfolio_snapshots, income_streams, yield_positions, analyses, photos

## Data Sources

See memory file `project_pds_data_sources.md` for full inventory of what's imported and what needs automation.

## Conventions

- Health metrics go in `health_metrics` with source field (apple_health, aura, randox, etc.)
- Financial transactions go in `transactions` with category field
- Cross-domain insights go in `analyses` table
- All importers are in `scripts/` directory
- Dedup via unique constraints — use `.onConflictDoNothing()`
- Never hallucinate APYs, rates, or health data — use verified sources or flag as unknown

## User Context

The user (Oak/Jay/Gary Bowles) has a detailed genomics-led health optimisation protocol and complex crypto/DeFi financial setup. See the Claude Projects memory for full context. Key: COMT AG (slow catecholamine clearance), VDR double-red (vitamin D resistance), LDLR double-hit (cardiovascular priority), PLIN1 TT (ectopic fat). No magnesium glycinate/taurate. No quercetin. No folic acid. ABCB1 impairment contraindicates piperine.
