---
layer: analysis
domain: health
updated: 2026-05-03
sources:
  - page: ../../00-processing/health/randox.md
  - page: ../../00-processing/genomics/lifecode-gx.md
---

# ApoB trajectory

## TL;DR
**4 ApoB data points now loaded** (was 1). Trajectory is **non-monotonic**: 110 → 119 → 88 → 113 mg/dL across Jun-2024 → Nov-2025. The 2025-04 → 2025-11 jump (88 → 113, +25 points) reverses the prior gain and is unexplained by anything in the PDS. Latest reading is 23 above the <90 target. Mid-May 2026 panel will be first post-berberine data point.

## Last refreshed: 2026-05-03

| Panel date | ApoB (mg/dL) | vs target (<90) | vs ideal (<80) | Δ vs prior |
|---|---|---|---|---|
| 2024-06-27 | 110 | +20 | +30 | — |
| 2024-08-05 | 119 | +29 | +39 | +9 |
| 2025-04-01 | **88** | −2 (target met) | +8 | **−31** |
| 2025-11-18 | 113 | +23 | +33 | **+25** |
| mid-May 2026 | pending | — | — | post-berberine |

**What changed vs prior refresh (2026-04-28):** Randox processing page expanded from 1 panel (63 metrics) to 4 panels (194 metrics). Three earlier ApoB values now in PDS — closes [apob-values-not-loaded](../../20-synthesis/blockers/apob-values-not-loaded.md). New finding: 2025-04 panel hit target (88) before regressing to 113 by Nov — the regression is the question, not the absolute level.

**Companion biomarkers — ApoB context (from same panels):**

| Marker | 2024-06-27 | 2024-08-05 | 2025-04-01 | 2025-11-18 |
|---|---|---|---|---|
| Total cholesterol (mmol/L) | 6.13 | 5.85 | 5.49 | — |
| LDL (mmol/L) | 4.29 | 4.35 | 3.86 | — |
| HDL (mmol/L) | 1.30 | 1.12 | 1.21 | — |
| Triglycerides (mmol/L) | 1.47 | 0.97 | 0.94 | — |
| hsCRP (mg/L) | 15.65 | 2.03 | 1.38 | — |

The 2025-11-18 panel is **missing the lipid panel and hsCRP** despite ApoB being present — flagged as suspected extraction gap in [randox.md](../../00-processing/health/randox.md). Without LDL-C / Tg for 2025-11, can't tell whether the ApoB rebound is driven by particle count alone or matched LDL-C rise.

## Method
```sql
-- Schema note: metric_type not metric_name; recorded_at not date; no reference_range column
SELECT recorded_at::date AS date, value
FROM health_metrics
WHERE source = 'randox' AND metric_type = 'apob'
ORDER BY recorded_at;
```

Overlay intervention dates:
- Berberine 500mg started 2026-04 (post-2025-11 panel; pre mid-May 2026 panel)
- Mid-May 2026 panel = first post-intervention data point (not yet drawn as of 2026-05-03)

## Interpretation framework
- **Hit <90**: protocol working. Continue, re-check August.
- **Hit <100 but not <90**: discuss statin (rosuvastatin) with GP per goal doc.
- **No movement / regression**: review statin, re-examine adherence, consider secondary drivers (ApoB despite LDL-C normal → check tg-rich lipoprotein contribution).

## Genomic context (from processing/genomics/lifecode-gx.md)
- LDLR double-hit → ApoB is *the* biomarker, not LDL-C.
- COMT AG + berberine interaction — no known issue, but log subjective energy/sleep around berberine start.

## Open questions
- **What drove the 2025-04 → 2025-11 regression** (88 → 113, +25 points)? Diet, weight, supplement, or measurement variance? Body comp also regressed in this window (see [body-composition-regression](body-composition-regression.md)) — ApoB rebound likely co-driven.
- 2025-11-18 panel: hsCRP, LDL, HDL, triglycerides, total cholesterol all absent despite earlier panels having them. Confirm whether PDF contains them (extraction gap) or panel scope changed.
- Homocysteine and MMA: not in any panel. Confirm on May 2026 requisition.
- Folic acid trajectory (5.4 → 13.7 → 18.1 µg/L) is rising — relevant to [folate-supraphysiological](../../20-synthesis/blockers/folate-supraphysiological.md).

## Links up
- blocks goal: [health-cardiovascular](../../20-synthesis/goals/health-cardiovascular.md)
