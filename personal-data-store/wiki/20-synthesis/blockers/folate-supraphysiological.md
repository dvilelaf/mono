---
layer: synthesis
domain: health
updated: 2026-04-23
---

# Blocker: folate supraphysiological

## TL;DR
Folate 34.8 µg/l suggests supplement overdose; undermines methylation interpretation.

## Blocks goal
[health-cardiovascular](../goals/health-cardiovascular.md)

## Evidence
Goal doc §Biomarker Verification: "Folate dose audit — supraphysiological at 34.8 µg/l, need to review supplement dosing before next draw." [apob-trajectory](../../10-analysis/health/apob-trajectory.md) — 2026-04-28: folate missing from DB import of 2025-11-18 panel (raw value known from goal doc).

## Smallest next action
Audit current supplement stack for folate sources. Standard supplemental methylfolate is 400–800 µg/day; 34.8 µg/l serum suggests substantially higher intake. Reduce or pause folate-containing supplements ≥2 weeks before May panel to get a clean baseline.

## What would raise certainty
Folate value on May 2026 panel within physiological range (7–45 nmol/L is lab-dependent; aim for mid-range). Also import folate from 2025-11-18 panel PDF into health_metrics so historical trend is visible.
