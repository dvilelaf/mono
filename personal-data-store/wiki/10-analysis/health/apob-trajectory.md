---
layer: analysis
domain: health
updated: 2026-04-23
sources:
  - page: ../../00-processing/health/randox.md
  - page: ../../00-processing/genomics/lifecode-gx.md
---

# ApoB trajectory

## TL;DR
Primary cardiovascular target is ApoB <90 (ideally <80). Four panel points exist. Populate the sequence from `health_metrics` before drawing conclusions.

## Method
```sql
SELECT date, value, reference_range
FROM health_metrics
WHERE source = 'randox' AND metric_name IN ('apob','apolipoprotein_b')
ORDER BY date;
```

Then overlay intervention dates:
- Berberine 500mg started 2026-04 (pre mid-May panel)
- Mid-May 2026 panel = first post-intervention data point

## Interpretation framework
- **Hit <90**: protocol working. Continue, re-check August.
- **Hit <100 but not <90**: discuss statin (rosuvastatin) with GP per goal doc.
- **No movement**: review statin, re-examine adherence, consider secondary drivers (ApoB despite LDL-C normal → check tg-rich lipoprotein contribution).

## Genomic context (from processing/genomics/lifecode-gx.md)
- LDLR double-hit → ApoB is *the* biomarker, not LDL-C.
- COMT AG + berberine interaction — no known issue, but log subjective energy/sleep around start.

## Open questions
- Fill in the four historical ApoB values from the panels (values not yet loaded into this page).
- Is homocysteine trending with ApoB, or independently?

## Links up
- blocks goal: [health-cardiovascular](../../20-synthesis/goals/health-cardiovascular.md)
