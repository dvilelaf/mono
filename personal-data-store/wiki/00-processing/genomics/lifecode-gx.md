---
layer: processing
domain: genomics
updated: 2026-04-23
sources:
  - table: genomics_variants
    query: SELECT * FROM genomics_variants
  - table: genomics_profiles
    query: SELECT * FROM genomics_profiles
  - table: analyses
    query: SELECT * FROM analyses WHERE domain = 'genomics'
---

# Lifecode Gx

## TL;DR
**0 rows** in genomics_variants, genomics_profiles, analyses as of 2026-04-23. Previous count (230 variants, 6 profiles) was from user context, not a DB query. Lifecode data has not yet been imported into this DB instance.

## Actual schema (verified 2026-04-23)
`genomics_variants`: id, profile_id (uuid → genomics_profiles.id), rsid, chromosome, position, genotype, gene, metadata
`genomics_profiles`: id, source, profile_type, imported_at, raw_data (jsonb), created_at

## Key variants (protocol-shaping — from source data, not DB)
- **COMT AG** — slow catecholamine clearance (avoid stimulants late, watch methyl donors)
- **VDR double-red** — vitamin D resistance (target 100–125 nmol/l)
- **LDLR double-hit** — cardiovascular priority (drives ApoB target)
- **PLIN1 TT** — ectopic fat tendency
- **ABCB1** — impaired → piperine contraindicated

## Contraindications (carry into every supplement decision)
- No magnesium glycinate/taurate
- No quercetin
- No folic acid (use folinic / 5-MTHF with care given COMT)
- No piperine

## Known gotchas
- **Schema drift corrected**: `genomics_variants` has no `profile` or `interpretation` columns. Profile is a UUID FK; interpretation would live in `metadata` jsonb. Query must JOIN to genomics_profiles for profile type.
- No `variant` column — genotype is stored as `genotype`.

## How to query (corrected)
```sql
SELECT gp.profile_type, gv.gene, gv.genotype, gv.rsid,
       gv.metadata->>'interpretation' AS interpretation
FROM genomics_variants gv
JOIN genomics_profiles gp ON gp.id = gv.profile_id
WHERE gp.profile_type IN ('Methylation','Detoxification','Nervous System')
ORDER BY gp.profile_type, gv.gene;
```

## Open questions
- When will the Lifecode Gx panel data be imported?
- Are interpretations stored in `metadata` or not at all?
- WGS decision pending. Would unlock rarer variants not covered by Lifecode panels.
