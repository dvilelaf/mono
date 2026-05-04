---
layer: processing
domain: genomics
updated: 2026-04-28
sources:
  - table: genomics_variants
    query: SELECT * FROM genomics_variants
  - table: genomics_profiles
    query: SELECT * FROM genomics_profiles
---

# Lifecode Gx

## TL;DR
**230 variants** in genomics_variants, **1 profile** in genomics_profiles as of 2026-04-28. Imported 2026-04-27. Profile: Jay Bowles (CP00126503), source=lifecode_gx. Previously 6 profiles in DB — only 1 present post-wipe; 5 profiles missing.

## Actual schema (verified 2026-04-23)
`genomics_variants`: id, profile_id (uuid → genomics_profiles.id), rsid, chromosome, position, genotype, gene, metadata
`genomics_profiles`: id, source, profile_type, imported_at, raw_data (jsonb), created_at

## Profile coverage gap
Only 1 of 6 prior profiles restored post-wipe (Jay Bowles CP00126503). Profile type for this profile: not yet verified — `profile_type` field may hold the source panel name or a category (Methylation, Detoxification, etc.). 5 profiles missing.

## Key variants (protocol-shaping — from source data, now DB-backed)
These 230 variants are now in the DB. Confirm via query that the key variants below are present.
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
- 5 missing profiles — are they separate Lifecode panel exports (Methylation, Detox, etc.) or copies of one panel? Source files on disk?
- What is the `profile_type` value for the imported CP00126503 profile? Needs a `SELECT profile_type FROM genomics_profiles` check.
- Are interpretations stored in `metadata` or not at all?
- WGS decision pending. Would unlock rarer variants not covered by Lifecode panels.
