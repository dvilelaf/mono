---
layer: synthesis
domain: cross
updated: 2026-05-03
---

# Goal scorecard — 2026-05-03

| Status | Goal | Evidence | Next action |
|--------|------|----------|-------------|
| 🔴 RED | [finance-monthly-spend](goals/finance-monthly-spend.md) — £19K/mo, 3-month break-even | Feb 2026 GBP outflow **£58,308** (3.1× target); £58,071 of that null-category — overrun is not yet adjudicable. ([monthly-spend](10-analysis/finance/monthly-spend.md)) | Categorise top-50 null-category GBP merchants and recompute Feb (≤ 1 day). |
| 🔴 RED | [health-cardiovascular](goals/health-cardiovascular.md) — ApoB <90, hsCRP <1.0 | ApoB **113 mg/dL (2025-11-18)**, +23 above target; rebounded from 88 in Apr-2025. Mid-May panel still not booked. ([apob-trajectory](10-analysis/health/apob-trajectory.md)) | Book mid-May Randox panel today; ensure ApoB, hsCRP, MMA, homocysteine, vitamin D, folate on requisition. |
| 🟠 AMBER | [finance-yield-170k](goals/finance-yield-170k.md) — $170K annualised by July 2026 | Annualised yield **$135K USD + £10.8K GBP**; gap **~$35K**; 9 weeks to deadline. APY now measurable. 68 ETH / LDO / $200K MEXC still not visible as positions. ([yield-gap](10-analysis/finance/yield-gap.md)) | Confirm wallet/exchange location of the three idle buckets and add yield_positions rows or deploy. |
| 🟠 AMBER | [health-body-composition](goals/health-body-composition.md) — reverse Apr–Nov 2025 trunk-fat expansion | Steps 8% below 11K target; gym ~1.5×/wk vs 2× goal. Body comp baseline (waist ~80cm) still not anchored. ([body-composition-regression](10-analysis/health/body-composition-regression.md)) | Pull waist/weight/BCA from 3 newly-loaded earlier Randox panels and the Apple Health body-comp series; anchor "best window" date range. |
| 🟠 AMBER | [data-automation](goals/data-automation.md) — automated raw data + ongoing insights | Wiki extract/analyse/synthesise jobs now running. APY connector live. Apple Health webhook still untested on home WiFi; Gmail OAuth not set up; Wise API key unclaimed. | Test Apple Health webhook on home WiFi (smallest of the three; 30 min). |

**Rules applied:** RED = stalled, regressed, or evidence-blocked from measurement. AMBER = no measurable progress this cycle. GREEN = measurable progress.

No GREEN this cycle: yield-170k *did* move from "unmeasurable" to "measurable" (significant progress) but the underlying gap has not closed, so it stays AMBER under the rule "measurable progress toward the deadline target."
