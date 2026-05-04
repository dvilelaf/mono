# growth-jobs

Runs the Jinn `growth-day` skill on a weekday cron and writes the brief to the PDS `documents` table (domain `growth`, type `growth-day-brief`).

Mirrors the `wiki-jobs` pattern: Express + node-cron, spawns headless `claude` CLI with a spec from `scripts/<job>.md`. Output logged to `logs/growth-jobs/`.

## Schedule (local time, node-cron)
- growth-day: `0 9 * * 1-5` — weekdays 09:00 (Oak's deep-block start)

Override via env: `GROWTH_DAY_CRON`. Disable with `GROWTH_JOBS_CRON_ENABLED=false`.

## Env

| Var | Default |
|---|---|
| `GROWTH_JOBS_PORT` | `3101` |
| `GROWTH_MONO_REPO` | `/Users/gcd/Repositories/main/mono` |
| `PDS_API_URL` | `http://localhost:3000` |
| `CLAUDE_BIN` | `claude` |
| `GROWTH_DAY_CRON` | `0 9 * * 1-5` |
| `GROWTH_JOB_TIMEOUT_MS` | `1200000` (20 min) |
| `GROWTH_JOBS_CRON_ENABLED` | `true` |

## Run manually
```bash
npm run run:growth-day
```

Or via HTTP when the server is up:
```bash
curl -X POST http://localhost:3101/run/growth-day
curl http://localhost:3101/status
```

## PM2
```bash
pm2 start apps/growth-jobs/ecosystem.config.cjs
pm2 save
```

## Output

Every run produces:
1. A log file under `logs/growth-jobs/growth-day-<timestamp>.log` containing the full session.
2. A row in PDS `documents` table — query via `GET http://localhost:3000/api/documents?domain=growth&type=growth-day-brief`.
3. An updated `growth/.local/growth-log.md` §5 in the mono repo with today's plan and the PDS document id.

## Notes

- Requires `claude` CLI on PATH. The runner spawns it with `cwd` set to the mono repo so the `growth-day` skill at `.claude/skills/growth-day/SKILL.md` is auto-discoverable.
- Each job runs with `--permission-mode bypassPermissions`. Scope is enforced by the spec at `scripts/growth-day.md`, not by a permission allowlist.
- `growth/.local/` is gitignored and must exist on disk for the skill to compute compliance against yesterday's plan. The spec gracefully degrades to a cold-start brief if it's missing.
- `bird` CLI is required for the skill's Teach + Understand reply detection. If absent, those buckets are marked unchecked.
- Per-run timeout: 20 min (override `GROWTH_JOB_TIMEOUT_MS`).
