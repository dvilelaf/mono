# Wiki eval fixtures

Each fixture in this directory describes structural invariants a wiki job's
output must satisfy. The eval harness in `apps/wiki-jobs/src/eval/` validates
the current wiki tree against these fixtures and posts regressions to the PDS
watchdog as `wiki_eval` alerts.

## Why structural, not prose

Wiki jobs are LLM-driven, so prose drifts run-to-run. Fixtures intentionally
check structured fields only — the set of goal page filenames, the count of
blocker links per goal, whether a read-me file exists for the current cycle,
word counts, required sections matched by regex — never literal prose.

## Format

```jsonc
{
  "name": "<fixture id>",
  "job": "extract" | "analyse" | "synthesise",
  "expectations": {
    "goalPages": ["filename.md", ...],     // required filenames in 20-synthesis/goals/
    "minBlockersPerGoal": 1,                // each goal page must list ≥ N blockers
    "requireBlockerLinksResolve": true,     // each linked blocker file must exist
    "requireTopBlockersSection": true,      // goal pages must have "Top blockers" header
    "readMe": {
      "required": true,
      "maxAgeDays": 14,                     // newest YYYY-MM-DD-read-me.md within window
      "maxWords": 500,
      "requiredSectionPatterns": ["regex", ...]
    },
    "blockerPage": {
      "requireBlocksGoalLink": true,        // each blocker page must link back to a goal
      "requireSmallestNextAction": true     // each blocker page must have that section
    }
  }
}
```

Update fixtures when the wiki layout changes intentionally — the test failure
is the alert that says "this drift is real, decide if it's a regression or a
schema bump and update the fixture."

## Running

```bash
cd apps/wiki-jobs
npm run run:eval                # validates current wiki state, exits non-zero on failure
npm run run:eval -- --report    # also POST regressions to PDS watchdog
```

The wiki-jobs service runs the eval weekly on `WIKI_EVAL_CRON`
(default Sunday 09:00) and reports failures to the watchdog automatically.
