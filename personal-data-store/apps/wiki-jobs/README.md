# wiki-jobs

Runs the three layered wiki jobs (extract, analyse, synthesise) against the personal wiki at `../../wiki/`.

Each job spawns a headless `claude` CLI process with the spec from `wiki/scripts/<job>.md`. Output logged to `logs/wiki-jobs/`.

## Schedules (local time, node-cron)
- extract: `0 6 * * *` — daily 06:00
- analyse: `0 7 * * *` — daily 07:00
- synthesise: `0 8 * * 2,4` — Tue/Thu 08:00

Override via env: `WIKI_EXTRACT_CRON`, `WIKI_ANALYSE_CRON`, `WIKI_SYNTHESISE_CRON`. Disable all with `WIKI_JOBS_CRON_ENABLED=false`.

## Run manually
```bash
npm run run:extract
npm run run:analyse
npm run run:synthesise
```

Or via HTTP when the server is up:
```bash
curl -X POST http://localhost:3100/run/extract
curl http://localhost:3100/status
```

## Eval harness

Validates the wiki against fixtures in `wiki/eval-fixtures/` and posts
regressions to the PDS watchdog as `wiki_eval` alerts. Catches silent rot
when prompts drift or schemas change.

```bash
npm run run:eval                # local validation, exits non-zero on failure
npm run run:eval -- --report    # also POST regressions to PDS watchdog
```

HTTP: `POST /eval` (optional `?report=true`). Cron: `WIKI_EVAL_CRON`
(default Sunday 09:00) runs with `--report` automatically. Disable with
`WIKI_EVAL_ENABLED=false`.

See `wiki/eval-fixtures/README.md` for fixture format and rationale.

## PM2
```bash
pm2 start apps/wiki-jobs/ecosystem.config.cjs
pm2 save
```

## Notes
- Requires `claude` CLI on PATH (override with `CLAUDE_BIN`).
- Each job runs with `--permission-mode bypassPermissions`. The spec `.md` files define scope (which layer each job may edit). Rationale: the alternative — maintaining a Bash allowlist for DB + HTTP access — drifts and still prompts under unattended cron. Scope is enforced by the spec, not the permission mode.
- Per-run timeout: 30 min (override `WIKI_JOB_TIMEOUT_MS`).
