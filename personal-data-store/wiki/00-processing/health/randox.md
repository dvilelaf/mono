---
layer: processing
domain: health
updated: 2026-04-23
sources:
  - table: health_metrics
    query: SELECT * FROM health_metrics WHERE source = 'randox'
---

# Randox Blood Panels

## TL;DR
**0 rows** in health_metrics (source=randox) as of 2026-04-23. Previous count (280 readings, 4 panels) was from user context, not a DB query. PDF extraction for the 4 historical panels has not yet been run against this DB instance. Next panel: mid-May 2026.

## Coverage (planned — not yet populated)
- Panels: 2024-06, 2024-08, 2025-04, 2025-11
- Refresh: **MANUAL PDF extraction** per panel

## Actual schema (verified 2026-04-23)
`health_metrics`: id, source, metric_type, value, unit, recorded_at, metadata, created_at
Note: `reference_range` is **not a column** — reference ranges would need to live in `metadata` jsonb or a separate lookup.

## Key tracked biomarkers (goal-linked)
- **ApoB** — cardiovascular primary target (<90, ideally <80)
- **hsCRP** — trajectory 15.65 → 2.03 → 1.38 → 1.14 → target <1.0
- **Folate** — currently supraphysiological (34.8 µg/l), needs dose audit
- **Vitamin D** — 95 nmol/l, target 100–125
- **Homocysteine, MMA** — methylation validation (request on May panel)
- **Pancreatic amylase/lipase** — persistently elevated, GP flag
- **Testosterone, FSH, LH, oestradiol** — fertility markers

## Known gotchas
- Panel composition varies — not every biomarker on every panel. Always filter by date when comparing trends.
- **Schema drift corrected**: field is `metric_type` (not `metric_name`) and `recorded_at` (not `date`). No `reference_range` column — check `metadata` jsonb.

## How to query (corrected)
```sql
SELECT recorded_at, metric_type, value, unit, metadata->>'reference_range' AS ref_range
FROM health_metrics
WHERE source = 'randox' AND metric_type = 'apob'
ORDER BY recorded_at;
```

## Open questions
- Is the May 2026 panel requisition including homocysteine and MMA?
- Is pancreatic amylase/lipase elevation tracked as a metric or only noted in notes?
- Where exactly are reference ranges stored — in `metadata` or not at all?
- When will the 4 historical panels be imported?
