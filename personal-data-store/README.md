# Personal Data Store

A TypeScript personal data service running locally on macOS. Modular monolith with Express 5, Drizzle ORM, PostgreSQL + pgvector. Localhost-bound, API key authenticated.

**Domains:** health, genomics, finance, business, documents

**Connectors:** Oura ring, Zapper (crypto), Gmail, MyFitnessPal (stub), Revolut (stub)

---

## Quick Start

```bash
# Start PostgreSQL with pgvector
docker compose up -d

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and API_KEY

# Run migrations
npm run db:migrate

# Start dev server (hot reload)
npm run dev
```

The server starts on `http://localhost:3000` by default.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgres://pds:pds_local@localhost:5432/personal_data_store` |
| `API_KEY` | Yes | Bearer token for all `/api/*` routes |
| `WEBHOOK_SECRET` | Yes | Secret header value for Apple Health webhook (`X-Webhook-Secret`) |
| `PORT` | No | HTTP port (default: `3000`) |
| `OURA_ACCESS_TOKEN` | No | Oura personal access token — required for `aura` connector |
| `ZAPPER_API_KEY` | No | Zapper API key — required for `crypto` connector |
| `GMAIL_CLIENT_ID` | No | Google OAuth2 client ID — required for `gmail` connector |
| `GMAIL_CLIENT_SECRET` | No | Google OAuth2 client secret — required for `gmail` connector |
| `GMAIL_REFRESH_TOKEN` | No | Google OAuth2 refresh token — required for `gmail` connector |

---

## API

All `/api/*` routes require `Authorization: Bearer <API_KEY>`.

### System

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/system/health` | Health check — no auth required |
| `GET` | `/api/system/connectors` | List all connectors and their last run status |
| `GET` | `/api/system/connectors/:name/runs` | Run history for a connector |
| `POST` | `/api/system/connectors/:name/sync` | Manually trigger a connector sync |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health/metrics` | Query metrics — params: `type`, `source`, `from`, `to` |
| `GET` | `/api/health/metrics/latest` | Latest metric by type — param: `type` (required) |
| `POST` | `/api/health/metrics` | Create a health metric |
| `GET` | `/api/health/supplements` | Query supplement logs — params: `from`, `to` |
| `POST` | `/api/health/supplements` | Log a supplement |
| `GET` | `/api/health/nutrition` | Query nutrition entries — params: `from`, `to` |

### Genomics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/genomics/profiles` | List all genomic profiles |
| `GET` | `/api/genomics/variants` | Query variants — params: `rsid`, `gene`, `profile_id` |
| `POST` | `/api/genomics/import` | Import a genomic profile |

### Finance

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/finance/wallets` | List crypto wallets |
| `POST` | `/api/finance/wallets` | Add a crypto wallet |
| `GET` | `/api/finance/portfolio` | Query portfolio snapshots — params: `wallet_id`, `latest` |
| `GET` | `/api/finance/accounts` | List financial accounts |
| `POST` | `/api/finance/accounts` | Create a financial account |
| `GET` | `/api/finance/transactions` | Query transactions — params: `account_id`, `from`, `to`, `category` |
| `GET` | `/api/finance/holdings` | Query holdings — params: `account_id`, `latest` |
| `GET` | `/api/finance/balances` | Query balances — params: `account_id`, `from`, `to` |
| `POST` | `/api/finance/import/csv` | Import transactions from CSV — multipart: `file`, `account_id`, `institution` |

Supported CSV formats for import: Revolut, Robinhood, Fidelity.

### Business

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/business/clients` | List clients — param: `status` |
| `POST` | `/api/business/clients` | Create a client |
| `GET` | `/api/business/projects` | List projects — params: `client_id`, `status` |
| `POST` | `/api/business/projects` | Create a project |
| `GET` | `/api/business/time` | Query time entries — params: `project_id`, `from`, `to` |
| `POST` | `/api/business/time` | Log a time entry |
| `GET` | `/api/business/invoices` | List invoices — params: `client_id`, `status` |
| `POST` | `/api/business/invoices` | Create an invoice |
| `GET` | `/api/business/expenses` | Query expenses — params: `category`, `from`, `to` |
| `POST` | `/api/business/expenses` | Log an expense |

### Documents

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/documents` | Query documents — params: `domain`, `from`, `to` |
| `GET` | `/api/documents/:id` | Get a single document by ID |
| `POST` | `/api/documents` | Create a document (embedding generated automatically if content provided) |
| `POST` | `/api/documents/search` | Semantic search — body: `{ query: string, limit?: number }` |

### Webhooks

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/apple-health` | Receive Apple Health data — requires `X-Webhook-Secret` header |

The Apple Health webhook is designed for use with the [Health Auto Export](https://www.healthautoexport.com/) app. Configure it to POST to `http://<your-mac-ip>:3000/webhooks/apple-health`.

---

## Connectors

Connectors run on cron schedules and can also be triggered manually via `POST /api/system/connectors/:name/sync`.

| Name | Schedule | Description |
|---|---|---|
| `aura` | Every 6 hours | Fetches sleep scores and daily activity from Oura Ring via the Oura API v2 |
| `crypto` | Every 15 minutes | Fetches crypto portfolio balances for all registered wallets via Zapper |
| `gmail` | Every hour | Imports last 24 hours of Gmail messages as documents (deduplicates by message ID) |
| `myfitnesspal` | Every 12 hours | Stub — no stable public API available; use manual data entry or CSV import |
| `revolut` | Daily at 2am | Stub — use CSV import (`POST /api/finance/import/csv`) instead |

---

## Database

```bash
# Generate migration after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio (browser UI)
npm run db:studio
```

Default connection (matches Docker Compose defaults):
```
postgres://pds:pds_local@localhost:5432/personal_data_store
```

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Tests use Vitest with file-level parallelism disabled to prevent database race conditions.
