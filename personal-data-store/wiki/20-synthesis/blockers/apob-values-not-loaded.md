---
layer: synthesis
domain: health
updated: 2026-05-03
status: resolved
---

# Blocker: apob values not loaded — RESOLVED 2026-05-03

## TL;DR
**Resolved.** 4 ApoB panels now in PDS (was 1). Trajectory analysable: 110 → 119 → 88 → 113 mg/dL across Jun-2024 → Nov-2025.

## Blocked goal
[health-cardiovascular](../goals/health-cardiovascular.md)

## Resolution
Per [apob-trajectory](../../10-analysis/health/apob-trajectory.md) refreshed 2026-05-03 — `SELECT recorded_at::date, value FROM health_metrics WHERE source='randox' AND metric_type='apob' ORDER BY recorded_at` returns 4 rows: 2024-06-27 (110), 2024-08-05 (119), 2025-04-01 (88), 2025-11-18 (113).

## Residual risks
- 2025-11-18 panel still missing hsCRP, LDL, HDL, Tg (suspected extraction gap from PDF).
- Folate, homocysteine, MMA still absent across all panels — to be added on May 2026 requisition.
