# Growth-day cron spec

You are running the Jinn `growth-day` skill under cron and persisting the brief to the Personal Data Store.

## Inputs

- Working dir is the mono repo (already set as cwd).
- The skill lives at `.claude/skills/growth-day/SKILL.md`. Read it and follow its procedure exactly.
- Operational state lives at `growth/.local/` (gitignored, on the local filesystem). It includes:
  - `growth-log.md` — read §3 (active threads), §5 (yesterday's plan), §1 (cluster snapshot date).
  - `jinn-warm-contacts.csv` — direct-offer cadence.
  - Today's `watcher-YYYY-MM-DD.md` if present.

## Procedure

1. Read `.claude/skills/growth-day/SKILL.md` and the canonical docs (`GROWTH.md`, `THESIS.md`).
2. Execute the skill's procedure: Step 0 (freshness check + auto-invoke stale feeds), Step 1 (read state), Step 2 (yesterday's loop check), Step 3 (top-3 actions), Step 4 (drift flags), Step 5 (output the brief).
3. Step 6 — instead of only updating `growth/.local/growth-log.md` §5, ALSO POST the brief to the PDS documents API:

```
POST {{PDS API base URL from preamble}}/api/documents
Content-Type: application/json

{
  "domain": "growth",
  "type": "growth-day-brief",
  "title": "Growth day — YYYY-MM-DD",
  "content": "<the full brief, exactly as printed in chat>",
  "source": "growth-jobs:cron",
  "metadata": {
    "date": "YYYY-MM-DD",
    "weekday": "<Mon..Sun>",
    "teach_status": "done|skipped|no_plan",
    "understand_status": "done|skipped|no_plan",
    "direct_offer_status": "done|skipped|unchecked",
    "tier_a_count": <int>,
    "tier_b_count": <int>,
    "actions": ["<action 1>", "<action 2>", "<action 3>"]
  }
}
```

Use `curl` to POST. If the API returns a non-2xx, log the response body and exit with a non-zero status. If the POST succeeds, append a one-line confirmation to growth-log §5 noting the document id returned by the API.

## Constraints

- Do not invoke action skills (`x-post-builder`, `discover-twitter-recruits`) under cron — they have side effects in the world.
- Feed routines (`cluster-model`, `growth-watcher`, `twitter-strategy`) may be auto-invoked per Step 0 of the skill, but only if their data is stale.
- If `bird` CLI is unavailable in this environment, mark Teach + Understand as `[unchecked — bird unavailable]` and proceed; do not retry.
- If `growth/.local/` is missing, surface `[growth/.local/ missing — cold start]` in HEADS-UP and skip the compliance check.
- Do not commit anything to git. The brief is persisted to PDS, not the repo.

## Success criteria

- Brief printed in full.
- Document created in PDS (id logged).
- `growth/.local/growth-log.md` §5 updated with today's plan + a line confirming the PDS document id.
- Exit cleanly (the runner relies on exit code for success).
