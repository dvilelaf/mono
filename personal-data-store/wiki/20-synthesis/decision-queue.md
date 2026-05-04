---
layer: synthesis
domain: cross
updated: 2026-05-03
---

# Decision queue — 2026-05-03

Ranked by impact × urgency. Top 3 are time-bounded (panel timing, idle yield foregone, spend proof window).

---

## 1. Book the mid-May 2026 Randox panel today
**Decision:** lock the panel date this week so berberine has ≥6 weeks of exposure by draw.

**Supporting data:** Latest ApoB **113 mg/dL** (Nov-2025), +23 above target. 4-panel trajectory now visible (110 → 119 → 88 → 113) — the Apr-2025 panel hit target before regressing, so the May panel is the first signal on whether berberine reverses the rebound. ([apob-trajectory](10-analysis/health/apob-trajectory.md), [panel-not-yet-drawn](blockers/panel-not-yet-drawn.md))

**Options:**
- Book home draw via Randox direct (fastest, prior workflow).
- Book GP draw and request the same assay panel (slower, but useful if folate audit needs clinical input).

**Deadline:** 2026-05-15 (panel must be drawn within mid-May to hit ≥6w berberine exposure).

---

## 2. Categorise the top-50 null-category GBP merchants
**Decision:** clear enough of the categorisation backlog to make Feb 2026 adjudicable and unblock the Apr–Jun proof window.

**Supporting data:** Feb GBP outflow £58,308 — £58,071 (99.6%) is null-category. Backlog: **6,747 rows / £2.01M GBP** (excl. >£50K transfers). Apr–Jun is the stated 3-month break-even window. ([monthly-spend](10-analysis/finance/monthly-spend.md), [merchant-categorisation-incomplete](blockers/merchant-categorisation-incomplete.md))

**Options:**
- Manual top-50 pass via the SQL frequency query (one sitting, ~2h).
- Add a rule-based categoriser on description regex + amount band (one engineering day; reusable).

**Deadline:** before next synthesis run (2026-05-07) — otherwise Apr/May numbers remain unreliable.

---

## 3. Confirm location of 68 ETH, LDO, $200K MEXC and deploy
**Decision:** decide whether each bucket is already deployed-and-mislabelled or genuinely idle, then act.

**Supporting data:** Goal doc lists these for **April 2026 deployment** — already ~1 month overdue. At 4% APY on $1.09M of idle capital, every week of delay = ~$840 foregone yield. Yield gap to $170K is $35K → these three buckets close it with margin. ([yield-gap](10-analysis/finance/yield-gap.md), [idle-capital-undeployed](blockers/idle-capital-undeployed.md))

**Options:**
- 68 ETH → stETH (Lido — already on book at 2.375% APY, low-friction).
- LDO → swap to USDC and route to Steakhouse Prime (3.68%) or Syrup USDT (4.54%).
- $200K MEXC → bridge to existing USDC yield surface (Steakhouse / Sky / Ethena).

**Deadline:** 2026-05-15 (every week of delay is measurable in $).

---

## 4. Resolve EY DeFi tax conversation
**Decision:** book the EY call with concrete document set in hand.

**Supporting data:** £26K swing between conservative and aggressive interpretation — comparable in magnitude to the $35K nominal yield gap. CountDeFi tax reports for **2022-23, 2023-24, 2024-25** are now indexed in the document corpus and provide the per-asset reward ledger EY needs. ([ey-tax-conversation-unresolved](blockers/ey-tax-conversation-unresolved.md)) [doc: 2025 Complete Tax Report Oak Tan.pdf] [doc: 2024 Complete Tax Report.pdf]

**Options:**
- Send the three CountDeFi reports to EY ahead of call; ask for written treatment note.
- Frame the call narrowly around (a) accrual-vs-disposal, (b) rebasing yields, (c) auto-compounding.

**Deadline:** before any post-July yield-realisation decisions; soft target end-May.

---

## 5. Resolve Strong export vs lifestyle ambiguity
**Decision:** answer the binary — has lifting paused, or has the Strong export stalled?

**Supporting data:** Strong stalled at **2026-03-31** (33 days idle); 59 sessions total. Sleep × activity analysis cannot run. Body-composition goal needs the gym signal. ([sleep-vs-activity](10-analysis/cross/sleep-vs-activity.md))

**Options:**
- Re-export Strong CSV for April–May; if it brings new sessions, the gap was export.
- If genuinely paused: log the pause and adjust gym-frequency target so dashboards stop flagging.

**Deadline:** before next synthesis run.

---

## 6. Anchor the "best body composition" window
**Decision:** identify the date range when waist was ~80cm using already-loaded data.

**Supporting data:** 3 earlier Randox panels (2024-06, 2024-08, 2025-04) and Apple Health body composition series (`weight` ~277 rows, `body_fat_percentage` ~129 rows, `lean_body_mass` ~129 rows) are in PDS but not pulled into the analysis. ([best-window-unresolved](blockers/best-window-unresolved.md), [body-composition-regression](10-analysis/health/body-composition-regression.md))

**Options:**
- Quick SQL pull on `waist_circumference`, `weight`, `body_fat_percentage` from Randox + Apple Health (≤ 1 hour).
- Defer until next Randox panel (May) to get an extra anchor.

**Deadline:** no hard deadline; useful before the May Randox draw so it serves as comparison.

---

## 7. Audit folate supplementation before May draw
**Decision:** reduce or pause folate ≥2 weeks ahead of the panel.

**Supporting data:** folate 34.8 µg/L on 2025-11 panel — supraphysiological. Goal doc flags an audit before next draw. ([folate-supraphysiological](blockers/folate-supraphysiological.md))

**Options:**
- Pause all folate-containing supplements for 2 weeks pre-draw.
- Drop to a single 400 µg methylfolate dose if pausing isn't tolerated.

**Deadline:** 2026-05-01 already passed if drawing 2026-05-15; pause now.

---

## 8. Test Apple Health webhook on home WiFi
**Decision:** smallest of the three data-automation blockers; close it first.

**Supporting data:** webhook set up but blocked by hotel WiFi at last attempt. Closing this unlocks historical Aura backfill path and improves regression-window sleep coverage. ([apple-health-webhook-untested](blockers/apple-health-webhook-untested.md))

**Options:**
- Run Health Auto Export against `localhost:3000` while on home WiFi (30 min).
- Defer until Gmail OAuth is also done and batch the data-automation work.

**Deadline:** no hard deadline.
