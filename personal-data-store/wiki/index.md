# Personal Wiki

Data in → insight out. The wiki turns the PDS into ranked blockers against the goals stored in the `documents` table (slug `goals-h2-2026`). See [00-processing/meta/goals.md](00-processing/meta/goals.md) for how to retrieve and update them.

## If you only read one thing
Latest synthesis note: `20-synthesis/YYYY-MM-DD-read-me.md` (generated Tue/Thu by the synthesise job).

## Goals (synthesis)
- [Cardiovascular — ApoB <90, hsCRP <1](20-synthesis/goals/health-cardiovascular.md)
- [Body composition — reverse Apr–Nov 2025 regression](20-synthesis/goals/health-body-composition.md)
- [Yield — $170K by July 2026](20-synthesis/goals/finance-yield-170k.md)
- [Monthly spend — £19K/mo, 3-month break-even](20-synthesis/goals/finance-monthly-spend.md)
- [Data automation — steady stream + insight cadence](20-synthesis/goals/data-automation.md)

## Structure
- `00-processing/` — per-source notes on what the data *is*
- `10-analysis/` — what the data *shows* (patterns, trends, correlations)
- `20-synthesis/` — what to *do about it* (goals + blockers)
- `scripts/` — three job prompt templates (extract, analyse, synthesise)
- `queries/` — standing questions with filed answers
- [ROADMAP.md](ROADMAP.md) — open questions, contradictions, lint findings
- [CLAUDE.md](CLAUDE.md) — conventions for the compiler

## Flow
```
PDS  →  00-processing  →  10-analysis  →  20-synthesis  →  you
         (extract job)     (analyse job)    (synthesise job)
```

Data flows upward only. Nothing above edits anything below.
