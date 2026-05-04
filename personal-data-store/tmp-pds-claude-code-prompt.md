# PDS upgrade for Claude PDS-first integration

Auto-memory now contains a "PDS-first" rule that makes Claude consult PDS at `http://pds:3000` (Tailscale MagicDNS) before reasoning about Oak, and write new info back. This task makes the server actually support that, end to end.

Working dir: PDS root. Stack: Express API on `:3000` (pm2), Next.js frontend on `:3001`, Postgres + pgvector via docker-compose, Drizzle migrations in `src/db/migrations`. `server.ts` already binds `0.0.0.0`.

Do all of the below. Run `npm run build` and `npm test` before declaring done. pm2 reload at the end.

## 1. Rotate API key

- Generate a fresh 64-char hex key (`openssl rand -hex 32`).
- Update `API_KEY=` in `.env`. Do not commit `.env`.
- Print the new key on stdout once, clearly labelled, so Oak can paste it into auto-memory.
- pm2 restart so the new key takes effect.

## 2. Tailscale serve over HTTPS

- Add `scripts/tailscale-serve.sh`: runs `tailscale serve --bg --https=443 http://localhost:3000`.
- README: document the resulting URL (`https://pds.<tailnet>.ts.net`) and that `http://pds:3000` continues to work on the tailnet.
- Don't break existing access.

## 3. `source` column on `documents` and `analyses`

- Drizzle migration: add `source text` (nullable, no default) to both tables.
- Update schemas: `src/domains/documents/documents.schema.ts`, `src/domains/analyses/analyses.schema.ts`.
- Update create/update routes and services to accept and persist `source`.
- Convention (document in `CLAUDE.md`): `oak`, `claude`, `import:<connector>`.

## 4. Unified `/api/about` endpoint

- New file `src/system/about.routes.ts`. Wire into `app.ts` under `/api/about`.
- `GET /api/about?topic=<string>&limit=<n>` (default 5, max 20).
- Behaviour: in parallel, run `semanticSearch(topic, limit)` against documents AND fetch the most recent `limit` rows from each domain table whose free-text or `metadata` field plausibly matches the topic. Use whatever indexes already exist; don't add ts_vector right now.
- Response shape:
  ```json
  {
    "documents": [...],
    "health": [...],
    "finance": [...],
    "workouts": [...],
    "genomics": [...],
    "business": [...],
    "analyses": [...]
  }
  ```
- Empty arrays for domains with no match, not omitted keys.

## 5. Inbox triage view

- New page `frontend/src/app/inbox/page.tsx`. Lists `documents` with `domain='inbox'`, ordered `created_at desc`.
- Each row: title, content preview (first 200 chars), source, created_at, "Promote" (modal: edit `domain` and `type`, save), "Delete".
- Add to main nav in `frontend/src/app/layout.tsx` (or wherever nav lives).

## 6. Backfill auto-memory into PDS

Read these three files from the host filesystem:

- `~/cowork/<session>/.auto-memory/feedback_mexc_withdrawal.md`
- `~/cowork/<session>/.auto-memory/feedback_yield_hurdle.md`
- `~/cowork/<session>/.auto-memory/project_yield_positions.md`

(Path may differ — find them. They're in the auto-memory directory used by Cowork.)

For each: `POST /api/documents` with:
- `domain: "finance"`
- `type: "preference"` (feedback_*) or `"position"` (project_yield_positions)
- `title`: from frontmatter `name`
- `content`: the markdown body below frontmatter
- `metadata`: parsed frontmatter as JSON
- `source: "oak"`

After successful POST, delete the auto-memory file and remove its line from `MEMORY.md`. Leave the new `feedback_pds_first.md` entry alone — it's a behavioural cue, not a fact about Oak.

## 7. Update `CLAUDE.md`

Add a section covering:

- New `/api/about` endpoint and its shape.
- `source` column convention on documents and analyses.
- `domain: "inbox"` catch-all pattern and the triage page.

## Acceptance

- From another tailnet device: `curl https://pds.<tailnet>.ts.net/api/system/health` returns 200.
- `curl -H "Authorization: Bearer $NEW_KEY" 'http://pds:3000/api/about?topic=cardiovascular&limit=3'` returns the unified shape with non-empty `documents` and at least one populated domain.
- New documents POSTed without `source` still work (nullable). Documents POSTed with `source: "claude"` round-trip the value.
- `/inbox` page renders rows with `domain='inbox'`, Promote and Delete both work.
- Three auto-memory files are gone from disk and from `MEMORY.md`. Equivalent rows exist in `documents` (verify via `GET /api/documents?domain=finance`).
- `npm run build` and `npm test` both green.

## Constraints

- Don't break existing endpoints, webhooks, or scheduler.
- No new top-level deps unless necessary; if added, justify.
- Migrations must be idempotent / safe to re-run.
- Style: terse commits, British English, no emoji.
