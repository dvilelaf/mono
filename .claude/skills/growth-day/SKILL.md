---
name: growth-day
description: Daily orchestrator for Jinn growth work — bundles outputs from cluster-model, growth-watcher, and twitter-strategy, checks GROWTH.md §4 daily-loop discipline (Teach / Understand / Direct offer / Interact), enforces the active-sprint precondition (§6), reads warm-contacts cadence and rung-based "ready to advance" queue, and surfaces 3 ranked actions for the day. Triggers on "growth day", "morning growth standup", "what should I do today for growth", "daily growth check", "what's pending", "start of day jinn", "let's plan today's growth work", "growth check-in", "what's next on growth". Reads growth/.local/growth-log.md (§6 active sprint, §3 active threads, §5 yesterday's plan), growth/.local/jinn-warm-contacts.csv, today's growth/.local/watcher-*.md if present, last cluster-model snapshot. Output is a chat briefing with six fixed sections — sprint progress, yesterday's loop check, today's top-3 actions, ready to advance, heads-up alerts, drift flags. Refuses to produce a top-3 if no active sprint is in §6 (fail-loud). Updates growth-log §5 with today's plan and §6 with daily progress.
---

# Growth day

The manual orchestrator. Run by Oak each day at the start of the deep block. Bundles the routine outputs and surfaces decisions.

## Read first
- [`GROWTH.md`](../../../GROWTH.md) — the bet, the daily loop, what to chase, what to avoid.
- [`THESIS.md`](../../../THESIS.md) — what teaches the right operators to self-identify.
- [`growth/.local/growth-log.md`](../../../growth/.local/growth-log.md) — full operational state. §6 holds the active sprint (cluster, window, inputs target, thresholds, daily progress); §7 archives sprint postmortems.
- [`growth/.local/jinn-warm-contacts.csv`](../../../growth/.local/jinn-warm-contacts.csv) — warm list with cadence; expects columns `rung` (cold / touched / warm / hot / frozen), `last_touch_date`, `next_move`, `next_move_due` alongside the existing fields.
- `growth/.local/watcher-YYYY-MM-DD.md` for today, if it exists.

This skill operationalises GROWTH §4 *Teach / Understand / Direct offer / Interact* as a daily decision aid. Do not redefine GROWTH-level claims here.

## Sprint precondition (fail-loud)

This skill refuses to produce a top-3 unless an active sprint is declared in growth-log §6. A sprint is the unit of focus — one cluster, one time-boxed window, declared inputs, declared thresholds, mandatory postmortem at the end. No sprint = no daily plan; the structure forces the user to either start a sprint or explicitly take a rest day. See Step 1.5 below for the check, and "Failure modes" for the fail-loud message shape.

## Warm-contacts ladder

The CSV models a four-rung ladder plus a parking state:

| Rung      | Definition                                                            | Typical next move                                          |
|-----------|-----------------------------------------------------------------------|------------------------------------------------------------|
| `cold`    | Identified candidate, no prior interaction.                           | First substantive reply on a recent post.                  |
| `touched` | One substantive exchange landed.                                      | Second reply OR named-mention in a teach/bridge post.      |
| `warm`    | Multi-turn back-and-forth; recognises Oak.                            | DM with one specific artifact OR co-thinking post.         |
| `hot`     | DMed back, on a call, in Telegram, or asked about Jinn directly.      | Direct offer (call, beta, working session, intro).         |
| `frozen`  | Out-of-cluster or decayed; do not advance.                            | None — review at sprint boundary only.                     |

`next_move` is free text describing the actual move; `next_move_due` is the date by which the move should ship. Growth-day's "Ready to advance" section surfaces rows where `next_move_due ≤ today`.

## What this skill does

One mode: **brief**. Reads the operational state, computes yesterday's compliance against the daily loop, surfaces today's three highest-leverage actions, flags anything from the watcher that needs attention now.

The skill does not act on Oak's behalf. Oak picks the actions. The skill writes the day's plan to growth-log §5 so tomorrow's run can compute compliance.

## When to run

- Once per day, ideally at the start of the deep block (Oak's deep block in his preferences).
- After `growth-watcher` has run for the day (today's watcher file exists).
- Skip on weekends unless cluster activity is high (per GROWTH §4: weekday cadence is canonical).

## Procedure

Note: Oak's posting handle is `@tannedoaksprout`. The display handle `@oaksprout` is canonical-display only and is not the live X account. Use `@tannedoaksprout` for all bird CLI calls.

### Step 0 — Freshness check + auto-invoke stale feeds

On weekday mornings, this skill ensures the three feed routines are fresh before producing the brief. Skip Step 0 entirely on weekends, or when Oak's invocation prompt includes a `skip feeds` instruction (e.g. running growth-day in the afternoon to refresh the brief without re-pulling everything).

Check each feed in this order; invoke via the Skill tool only if stale.

1. **`cluster-model` (weekly).** Read `growth/.local/growth-log.md` §1 and find the most recent `Sampled this run: YYYY-MM-DD` date across all three clusters. If that date is more than 7 days ago, invoke the `cluster-model` skill and wait for it to finish before continuing. Otherwise skip.

2. **`twitter-strategy` (weekly).** Check whether `growth/.local/twitter-strategy-last-run.md` exists with a timestamp within the last 7 days. If missing or stale, invoke the `twitter-strategy` skill and wait. Otherwise skip.

3. **`growth-watcher` (daily on weekdays).** Check whether `growth/.local/watcher-YYYY-MM-DD.md` exists for today's UTC date. If missing and today is Mon–Fri, invoke the `growth-watcher` skill and wait. Otherwise skip.

Order matters: `cluster-model` first because its output (§1 cluster snapshot) feeds `growth-watcher`'s "cluster signals" detection. `twitter-strategy` second because its drift flags feed Step 4 below. `growth-watcher` last because its output is the most time-sensitive and should reflect the freshest cluster snapshot.

If a feed invocation fails (network, bird auth, rate limit), continue to Step 1 with whatever state exists, and surface the failure in the HEADS-UP section of the output: `[<feed> failed to refresh — using stale data from YYYY-MM-DD]`. Do not retry automatically.

### Step 1 — Read state

Read in order:
1. `GROWTH.md` (re-anchor every run; cheap and prevents drift).
2. `growth/.local/growth-log.md` — full file, especially §6 (active sprint block), §3 (active threads), §5 (yesterday's plan; look for the most recent `### YYYY-MM-DD plan` sub-heading inside §5), §1 (cluster snapshot date).
3. `growth/.local/jinn-warm-contacts.csv` — pay attention to `rung`, `next_move`, `next_move_due`, `last_touch_date`, and the legacy `Status / Next action` and `Prior context` fields. Build the "ready to advance" queue here: rows where `next_move_due ≤ today` and `rung ∈ {cold, touched, warm, hot}`.
4. Today's `growth/.local/watcher-YYYY-MM-DD.md` if it exists. If it does not, mark the watcher feed as missing.

### Step 1.5 — Sprint precondition (fail-loud)

Inspect §6 of `growth-log.md`. An *active* sprint block has all of: a cluster name, a window with `start_date` ≤ today ≤ `end_date`, an inputs target, and thresholds.

- If §6 is missing entirely, or contains no sprint block, or the most recent sprint's `end_date` is in the past with no successor: **stop here**. Emit the fail-loud message (see Failure modes) and do NOT continue to Steps 2–6. The user must either declare a new sprint or explicitly mark a rest day in §6.
- If §6 contains an active sprint, parse: cluster, window, inputs target (as a list of countable items, e.g. "6 teach posts", "1 bridge post"), thresholds. Compute progress so far against the inputs target by counting matching entries from §5 daily plans within the sprint window. This becomes the SPRINT section of the brief.

### Step 2 — Yesterday's loop check

Compare yesterday's plan in growth-log §5 against what actually shipped, using these signals:
- **Teach:** did Oak's timeline gain a substantive original post yesterday? Use `bird user-tweets tannedoaksprout -n 5 --plain`. If yes, mark Teach `[done]`. If a thread was scheduled in §5 but no post landed, mark `[skipped — surface to today]`.
- **Understand:** did Oak reply substantively to a candidate post? Use `bird user-tweets tannedoaksprout -n 10 --plain` and look for replies (tweets starting with `@`).
- **Direct offer:** did the warm list see a contact? Update `Status / Next action` field per row.
- **Interact:** mostly invisible from public data; do not infer. Mark `[unknown]`.

If §5 has no entry for yesterday (skill is being run for the first time, or yesterday was skipped), mark each bucket `[no plan]` and skip the compliance check.

### Step 3 — Compute today's top-3 actions, ranked by leverage

The leverage ranking heuristic, in priority order (do not invent a different ranking):

**Tier A — high leverage, ship today:**
- Reply opportunity in the 30-min top-replies window from today's watcher file.
- Sprint input still owed today to stay on cadence (e.g. teach post if behind on 3/wk pace).
- Bridge post (from `cluster-model` handoff) ready to ship and Tue–Thu 09:00–14:00 cluster-peak window is open today.
- Warm-list contact whose `next_move_due` is today or overdue, *and* whose `rung` is in the active sprint's target cluster (advance these first).
- Warm-list contact whose `Next action` is overdue (>7 days since last contact for High priority, >14 days for Medium) — legacy fallback when `next_move_due` is blank.

**Tier B — schedule:**
- Methodology question on a candidate's recent post (from watcher §2 fresh-substantive-posts).
- Discovery round in `discover-twitter-recruits` if the last round was >14 days ago.
- Cluster-model refresh if last snapshot is >7 days old.

**Tier C — defer unless deep-block has slack:**
- Stewardship pings (segment E in warm contacts).
- DeFiLlama / parking-lot integrations.

Pick three actions, one per Tier A item (or two from A and one from B if A has only two), to surface in the brief. Each action must be specific: handle, post URL where relevant, exact phrasing of the reply or post (or pointer to where the draft lives — growth-log §3 or §2).

### Step 4 — Read drift flags from twitter-strategy if available

If `twitter-strategy` was run within the last 7 days (no automated detection — Oak supplies the date), incorporate its top-3 drift flags as a separate section. Do not re-run `twitter-strategy` from this skill — invoking another skill from inside a skill should be done by Oak, not auto-chained.

### Step 5 — Output the brief

Print the brief inline in chat. Use the format below exactly. Each section earns its keep — do not omit, but do mark sections empty as `(none)`.

### Step 6 — Update growth-log §5 with today's plan, and §6 with sprint progress

Append today's plan to growth-log §5 with this shape:
```
### YYYY-MM-DD plan
1. [action 1 — exact handle / URL / draft]
2. [action 2 — exact handle / URL / draft]
3. [action 3 — exact handle / URL / draft]

Heads-up: [count] from watcher; drift flags: [count from twitter-strategy].
```

Append today's progress to growth-log §6 *Daily progress* sub-section under the active sprint, with this shape:
```
- YYYY-MM-DD — Inputs: <teach: N/target>, <reply cascades: N/target>, <bridge: N/target>. Rungs advanced: <handle (X→Y), …>. Inbound: <mentions/quotes>. Notes: <one line>.
```

Daily progress accumulates across the sprint window; the sprint-end postmortem reads this sub-section to compute final input/threshold attainment. This is what tomorrow's `growth-day` invocation will compare against.

## Output format

```
GROWTH DAY — YYYY-MM-DD

SPRINT — <cluster name> — day N of M
  Inputs:   teach <done>/<target>, reply-cascades <done>/<target>, bridge <done>/<target>
  Thresholds (informational, evaluated at sprint end):
    - <threshold 1>: <current state>
    - <threshold 2>: <current state>
  Window: <start> → <end>; postmortem due <end>.

YESTERDAY (loop check)
  Teach           [done / skipped / no plan]    [URL or note]
  Understand     [done / skipped / no plan]    [URL or note]
  Direct offer   [done / skipped / no plan]    [name or note]
  Interact       [unknown — out of scope]

TODAY (top-3, ranked by leverage)
  1. [Tier A — single sentence imperative — handle / URL / draft pointer]
  2. [...]
  3. [...]

READY TO ADVANCE (warm-list rows with next_move_due ≤ today)
  - @handle (rung X → Y) — <next_move text> — due YYYY-MM-DD
  (or) (none — queue clear)

HEADS-UP (from today's watcher)
  [list of items needing attention now — replies received, top-replies windows still open]
  (or) (none today — watcher quiet)

DRIFT (from latest twitter-strategy if <7 days old)
  [list of drift flags]
  (or) (no recent twitter-strategy run — consider running it this week)

WRITTEN TO: growth/.local/growth-log.md §5 (today's plan), §6 (daily progress)
```

## Voice constraints

- British English. No emoji. Plain prose. Decision-shaped.
- Each action is one sentence with one verb. *"Reply to TreebeardAI's architecture follow-up: [draft pointer in §3]"*, not *"Consider engaging Treebeard if you have time"*.
- If yesterday's plan was skipped two days running, surface that as a drift flag in the heads-up section.
- Do not editorialise about Oak's productivity. The skill reports; it does not coach.

## Composition

- **Inputs:** canonical docs, growth-log, warm-contacts CSV, today's watcher file, latest twitter-strategy output (if recent).
- **Outputs:** chat brief, updated growth-log §5 (today's plan) and §6 (sprint daily progress).
- **Consumes:** `growth-watcher` outputs, `cluster-model` outputs, `twitter-strategy` outputs.
- **Auto-invokes stale feed routines** in Step 0: `cluster-model`, `growth-watcher`, `twitter-strategy`. Action routines (`x-post-builder`, `discover-twitter-recruits`) remain Oak-driven from the brief's recommendations.

## What this skill does not do

- Run *action* routines (`x-post-builder`, `discover-twitter-recruits`). Those have side-effects in the world (publish posts, change recruit lists) and require Oak's explicit invocation from the brief.
- *Feed* routines (`cluster-model`, `growth-watcher`, `twitter-strategy`) are auto-invoked in Step 0 when stale. They are read-only refreshes of the data plane.
- Draft reply text or posts. (That is `x-post-builder`.)
- Score posts. (That is `x-algorithm-grader`.)
- Make recruitment decisions. (Oak picks the actions; this skill ranks options.)

## Failure modes to handle gracefully

- **No active sprint in §6 (fail-loud).** Stop after Step 1.5. Emit exactly:
  ```
  GROWTH DAY — YYYY-MM-DD — BLOCKED

  No active sprint in growth-log §6.

  Either:
    1. Declare a sprint by appending a §6 sprint block (cluster, window, inputs target, thresholds, decision rule), then re-run growth-day.
    2. Mark today an explicit rest day by appending under §6: `- YYYY-MM-DD — rest day, no sprint.`

  Sprint block template:
    ### Sprint #N — <cluster name>
    - Window: YYYY-MM-DD → YYYY-MM-DD
    - Cluster definition: <verbatim from Oak>
    - Inputs target: <e.g. 6 teach posts, reply cascade after each, 1 bridge post>
    - Thresholds: <e.g. 2 Tier-A warm rung, 1 inbound mention/quote, bonus 1 hot rung>
    - Decision rule: <hit ≥1 → double down; hit 0 → postmortem + pivot; postmortem either way>
  ```
  Do NOT proceed to compute a top-3, do NOT write to §5, do NOT auto-create a sprint. The fail-loud is the structural forcing function.
- **Watcher file missing for today.** Note: `[watcher not run today — consider running growth-watcher first]`. Continue with the rest of the brief using only growth-log state.
- **Growth-log §5 missing yesterday's plan.** Mark each loop bucket `[no plan]` and skip the compliance check. Still propose today's top-3.
- **Warm-contacts CSV missing.** Note: `[warm contacts not available — direct-offer compliance unchecked]`. Continue with what's readable.
- **Warm-contacts CSV present but missing rung columns.** Note: `[warm contacts on legacy schema — ready-to-advance unavailable, falling back to Status/Next-action heuristic]`. Continue.
- **No active threads in §3.** Note: `[no active threads — propose discovery round]` and surface a `discover-twitter-recruits` invocation as a Tier B action.
- **Sprint window has ended (end_date < today) and no postmortem in §7.** Emit a HEADS-UP item: `[Sprint #N ended YYYY-MM-DD — postmortem overdue. Write to §7 before declaring sprint #N+1.]` Treat the sprint as inactive (fail-loud) until the postmortem is written.
- **Feed routine fails mid-run** (Step 0). Continue with whatever stale state exists. Surface in HEADS-UP as `[<feed> failed: <one-line cause>]`. Do not retry automatically.
- **Skip-feeds override.** If Oak's invocation prompt contains "skip feeds" or "feeds already fresh", skip Step 0 entirely and proceed to Step 1.
