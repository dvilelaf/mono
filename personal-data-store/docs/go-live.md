# Go-Live Briefing

**Purpose:** Everything needed to take the personal data store from "tests passing" to running live with real data on macOS.

**Working directory:** `/Users/gcd/Repositories/main/personal-data-store`

---

## What's Already Built

- Express API at `http://localhost:3000` — health, genomics, finance, business, documents domains
- PostgreSQL + pgvector via Docker Compose
- Connectors: Oura (aura), Zapper crypto, Gmail, MFP stub, Revolut stub
- CSV import for Revolut, Robinhood, Fidelity
- Apple Health webhook (for Health Auto Export iOS app)
- 55 tests passing

---

## What Needs to Happen

### 1. Create `.env` from template

Copy `.env.example` to `.env` and fill in real values. The user needs to supply credential values (see each section below), but the agent can scaffold the file and verify the DB is running.

```
DATABASE_URL=postgres://pds:pds_local@localhost:5432/personal_data_store
API_KEY=<choose a strong random string>
WEBHOOK_SECRET=<choose a strong random string>
PORT=3000
OURA_ACCESS_TOKEN=<from step 2>
ZAPPER_API_KEY=<from step 3 — optional>
GMAIL_CLIENT_ID=<from step 4>
GMAIL_CLIENT_SECRET=<from step 4>
GMAIL_REFRESH_TOKEN=<from step 4>
OPENAI_API_KEY=<from step 5 — optional but enables semantic search>
```

### 2. Oura Access Token

The user gets this from: https://cloud.ouraring.com/personal-access-tokens

It's a single string — no OAuth needed. Once added to `.env` as `OURA_ACCESS_TOKEN`, the `aura` connector will work.

**Known issue to fix:** `src/connectors/aura.connector.ts` inserts health_metrics without deduplication. Every sync re-inserts the last 7 days of data. Before going live, add a unique constraint on `(source, metric_type, recorded_at)` to `health_metrics` and change the insert to `.onConflictDoNothing()`. Otherwise data multiplies every 6 hours.

Schema fix needed in `src/domains/health/health.schema.ts`:
```typescript
// Add to healthMetrics table definition:
uniqueOn: unique().on(healthMetrics.source, healthMetrics.metricType, healthMetrics.recordedAt),
```
Then generate + apply a migration, and update `aura.connector.ts` to use `.onConflictDoNothing()`.

### 3. Zapper API Key (Crypto)

Zapper API key from https://studio.zapper.xyz — the connector attempts requests without a key too (unauthenticated), so this can be left blank initially to test.

The crypto connector needs wallet addresses registered in the DB first:
```bash
curl -X POST http://localhost:3000/api/finance/wallets \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"address": "0x...", "chain": "ethereum", "label": "Main wallet"}'
```

After wallets exist, trigger a manual sync:
```bash
curl -X POST http://localhost:3000/api/system/connectors/crypto/sync \
  -H "Authorization: Bearer <API_KEY>"
```

### 4. Gmail OAuth2 Credentials

This is the most complex step. The user must do the browser portion themselves. Agent can verify and test once credentials are in place.

**User must do:**
1. Go to https://console.cloud.google.com
2. Create a project (or use existing)
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Download client credentials → get `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`
6. Get a refresh token — easiest via OAuth Playground (https://developers.google.com/oauthplayground):
   - Settings → Use your own OAuth credentials → enter client ID + secret
   - Select `https://www.googleapis.com/auth/gmail.readonly` scope
   - Authorize → Exchange auth code → copy Refresh token

Put all three values in `.env`. Then test:
```bash
curl -X POST http://localhost:3000/api/system/connectors/gmail/sync \
  -H "Authorization: Bearer <API_KEY>"
```

Check the result:
```bash
curl http://localhost:3000/api/system/connectors/gmail/runs \
  -H "Authorization: Bearer <API_KEY>"
```

### 5. OpenAI API Key (Optional — Semantic Search)

Without `OPENAI_API_KEY`, documents are stored but embeddings are zero-vectors (semantic search won't return useful results). With the key, embeddings are generated on document creation.

Get key from https://platform.openai.com/api-keys and add as `OPENAI_API_KEY` in `.env`.

### 6. Apple Health Webhook

Requires the Health Auto Export iOS app ($6) on the user's iPhone.

**Setup:**
1. Find the Mac's local IP: `ipconfig getifaddr en0`
2. In Health Auto Export app → Automation → Add Export → REST API
3. Set URL to: `http://<mac-local-ip>:3000/webhooks/apple-health`
4. Add header: `X-Webhook-Secret: <WEBHOOK_SECRET from .env>`
5. Select desired metrics and set export frequency

The iPhone and Mac must be on the same WiFi network. The webhook does not require auth beyond the secret header.

Test that data is arriving:
```bash
curl http://localhost:3000/api/health/metrics?source=apple_health \
  -H "Authorization: Bearer <API_KEY>"
```

### 7. CSV Import (Revolut, Robinhood, Fidelity)

First create a financial account for each institution:
```bash
curl -X POST http://localhost:3000/api/finance/accounts \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Revolut GBP", "institution": "revolut", "currency": "GBP", "accountType": "checking"}'
```

Then import CSV (note the `account_id` from the create response):
```bash
curl -X POST http://localhost:3000/api/finance/import/csv \
  -H "Authorization: Bearer <API_KEY>" \
  -F "file=@/path/to/revolut-export.csv" \
  -F "account_id=<id>" \
  -F "institution=revolut"
```

Supported values for `institution`: `revolut`, `robinhood`, `fidelity`.

### 8. Run Persistently with pm2

Install pm2 globally if not present:
```bash
npm install -g pm2
```

Start the service:
```bash
cd /Users/gcd/Repositories/main/personal-data-store
pm2 start npm --name "personal-data-store" -- run start
pm2 save
pm2 startup  # follow the printed command to enable on boot
```

Verify running:
```bash
pm2 status
pm2 logs personal-data-store
```

Note: `npm run start` should run the compiled output. Check `package.json` for the `start` script — if it doesn't exist, add `"start": "node dist/server.js"` and ensure `npm run build` compiles TypeScript first.

---

## Order of Operations for Agent

1. Check Docker is running: `docker compose ps`
2. Start if needed: `docker compose up -d`
3. Verify `.env` exists and DATABASE_URL is set
4. Run `npm run db:migrate` to ensure schema is current
5. **Fix the Oura dedup issue** (see step 2 above) — generate + apply migration
6. Build TypeScript: `npm run build` (verify this script exists in package.json)
7. Start with pm2
8. Verify health endpoint: `curl http://localhost:3000/api/system/health`
9. Test each connector that has credentials configured
10. Report what's working and what still needs user credentials

---

## Known Gaps / Stubs

- **MyFitnessPal connector** (`src/connectors/myfitnesspal.connector.ts`) — no public API. Options: manual entry via `POST /api/health/nutrition`, or a future scraper.
- **Revolut connector** (`src/connectors/revolut.connector.ts`) — stub directing to CSV import. Revolut does have an Open Banking API but it requires UK/EU business account. CSV import is the practical path.
- **Genomics** — no connector. Data imported manually via `POST /api/genomics/import` with raw JSON from 23andMe or AncestryDNA exports.

---

## Verification Checklist

After setup, verify end-to-end:

- [ ] `GET /api/system/health` returns 200
- [ ] `GET /api/connectors` lists all 5 connectors
- [ ] Aura sync returns recordsSynced > 0 (after fixing dedup)
- [ ] Gmail sync imports messages, no duplicates on re-run
- [ ] Crypto sync returns data (after adding a wallet)
- [ ] `GET /api/health/metrics` returns Oura data
- [ ] `GET /api/documents` returns Gmail messages
- [ ] `POST /api/documents/search` with a query returns semantically relevant results (requires OpenAI key)
- [ ] pm2 shows service running after `pm2 status`
- [ ] Service auto-restarts after reboot (after `pm2 startup`)
