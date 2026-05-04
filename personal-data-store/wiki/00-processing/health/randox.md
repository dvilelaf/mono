---
layer: processing
domain: health
updated: 2026-05-03
sources:
  - table: health_metrics
    query: SELECT * FROM health_metrics WHERE source = 'randox'
---

# Randox Blood Panels

## TL;DR
**194 rows** in health_metrics (source=randox) as of 2026-05-03 — **all 4 historical panels imported**. Up from 63 rows / 1 panel on 2026-04-28. 83 distinct metric types now present (was 63). Next panel: mid-May 2026.

## Coverage (actual — populated)
| Panel date | Metrics |
|---|---|
| 2024-06-27 | 44 |
| 2024-08-05 | 41 |
| 2025-04-01 | 46 |
| 2025-11-18 | 63 |

Refresh: **MANUAL PDF extraction** per panel.

## Actual schema (verified 2026-04-23)
`health_metrics`: id, source, metric_type, value, unit, recorded_at, metadata, created_at
Note: `reference_range` is **not a column** — reference ranges would need to live in `metadata` jsonb or a separate lookup.

## Key tracked biomarkers (goal-linked) — full trajectories now in DB

| Marker | 2024-06-27 | 2024-08-05 | 2025-04-01 | 2025-11-18 | Target |
|---|---|---|---|---|---|
| ApoB (mg/dl) | 110 | 119 | 88 | 113 | <90 (ideal <80) |
| hsCRP (mg/l) | 15.65 | 2.03 | 1.38 | — | <1.0 |
| LDL (mmol/l) | 4.29 | 4.35 | 3.86 | — | — |
| HDL (mmol/l) | 1.30 | 1.12 | 1.21 | — | — |
| Triglycerides (mmol/l) | 1.47 | 0.97 | 0.94 | — | — |
| Total cholesterol (mmol/l) | 6.13 | 5.85 | 5.49 | — | — |
| HbA1c (mmol/mol) | 35.74 | 30.49 | 33.01 | — | — |
| Glucose (mmol/l) | 4.61 | 3.92 | 4.48 | — | — |
| Insulin (mIU/l) | 29.6 | 14.1 | 40.5 | — | — |
| Folic acid (µg/l) | 5.4 | 13.7 | 18.1 | — | — |
| Vitamin D (nmol/l) | 67 | 99 | 103 | — | 100–125 |

**Important data quality note:** lipid panel (LDL/HDL/triglycerides/total cholesterol), hsCRP, HbA1c, glucose, insulin, folic acid, vitamin D are all present in the 3 earlier panels but **absent from the 2025-11-18 panel** in the DB. The 2025-11-18 panel covers 63 metric types — broader by count but missing this entire metabolic-and-inflammation slice. Either the November panel scope was different, or the PDF extraction missed those pages — needs verification.

## Other goal-relevant markers (in DB)
- **Homocysteine, MMA** — not present in any of the 4 panels. Methylation validation still pending — confirm on May 2026 panel requisition.
- **Pancreatic amylase, lipase** — `pancreatic_amylase` and `lipase` present.
- **Testosterone (free), FSH, LH, oestradiol, SHBG, prolactin** — fertility markers present.
- **Lp(a)** — `lp_a` present.
- **Iron, ferritin, transferrin, transferrin_saturation, B12** — full iron / methylation cofactor panel.
- **C-peptide, hbA1c, insulin, glucose** — full glycaemic panel (3 of 4 panels).
- **H. pylori (`h_pylori`)** — present.

## Full metric_type list (83 types)
albumin, alp, alt, anti_tg, anti_tpo, apob, apo_ciii, apo_e, aso_titre, ast, basophil_count, bmi, calcium_adjusted, cardiovascular_risk_score, chloride, c_peptide, creatine_kinase, creatinine, cystatin_c, diastolic_bp, egfr, eosinophil_count, ferritin, fib4_score, folic_acid, free_testosterone, fsh, ft3, ft4, ggt, glucose, haematocrit, haemoglobin, hba1c, hdl, hdl_chol_ratio, height, hip_circumference, h_pylori, hs_crp, insulin, iron, ldl, lh, lipase, lp_a, lymphocyte_count, magnesium, mch, mchc, mcv, monocyte_count, neutrophil_count, oestradiol, oxygen_saturation, pancreatic_amylase, phosphate, platelet_count, potassium, prolactin, pth, pulse, rbc_count, shbg, small_ldl, sodium, systolic_bp, total_antioxidant_status, total_bilirubin, total_cholesterol, tpsa, transferrin, transferrin_saturation, triglycerides, tsh, urea, uric_acid, vitamin_b12, vitamin_d, waist_circumference, waist_hip_ratio, wbc_count, weight.

## Known gotchas
- Panel composition varies — not every biomarker on every panel. Always filter by date when comparing trends.
- 2025-11-18 panel **does not contain** the lipid panel (LDL/HDL/triglycerides/total cholesterol), hsCRP, HbA1c, glucose, insulin, folic acid, or vitamin D — even though earlier panels do. Either a different panel scope or extraction gap (needs PDF re-check).
- **Schema drift corrected**: field is `metric_type` (not `metric_name`) and `recorded_at` (not `date`). No `reference_range` column — check `metadata` jsonb.

## How to query (corrected)
```sql
SELECT recorded_at::date, metric_type, value, unit, metadata->>'reference_range' AS ref_range
FROM health_metrics
WHERE source = 'randox' AND metric_type = 'apob'
ORDER BY recorded_at;
```

## Open questions
- Is the May 2026 panel requisition including homocysteine and MMA?
- 2025-11-18 panel: does the source PDF actually contain the missing markers (hsCRP, lipids, HbA1c, glucose, insulin, vitamin D, folate)? If yes, this is an extraction gap to fix.
- Where exactly are reference ranges stored — in `metadata` or not at all?
- ApoB trajectory 110 → 119 → 88 → 113 (LDLR double-hit goal-critical): the 2025-04 → 2025-11 jump from 88 → 113 wants explanation. Diet/protocol change between panels?
