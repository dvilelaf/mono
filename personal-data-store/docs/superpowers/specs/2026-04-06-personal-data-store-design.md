# Personal Data Store — Design Spec

A TypeScript modular monolith that serves as a personal data hub, running locally on macOS. It stores diverse personal data (health, genomics, finance, business, documents) in PostgreSQL, exposes a REST API for AI agents and future clients, and synchronises with external services via scheduled connectors.

## Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **ORM**: Drizzle
- **Database**: PostgreSQL + pgvector (via docker-compose)
- **Scheduler**: node-cron
- **Embedding generation**: Claude or OpenAI API

## Architecture

Modular monolith — single process, single database. Internal modules organised by domain. Connectors are separate from domain logic.

```
Clients (Claude chat, Claude skill, future UI)
         │
         ▼
   REST API (Express) — localhost:PORT + API key auth
         │
   ┌─────┴──────────────────────────┐
   │         Domain Services         │
   │  health │ genomics │ finance    │
   │  business │ documents           │
   └─────┬──────────────────────────┘
         │
   ┌─────┴──────────────────────────┐
   │       Data Access (Drizzle)     │
   └─────┬──────────────────────────┘
         │
   ┌─────┴──────────────────────────┐
   │       Connector Engine          │
   │  apple_health │ aura │ mfp     │
   │  crypto │ revolut │ gmail      │
   │  ┌──────────────────────────┐  │
   │  │  Scheduler (node-cron)   │  │
   │  └──────────────────────────┘  │
   └─────┬──────────────────────────┘
         │
   PostgreSQL + pgvector
```

## Security

- **Localhost-only binding** — service never exposed to the network
- **API key auth** — all endpoints require `Authorization: Bearer <API_KEY>`
- **Webhook secret** — Apple Health webhook uses a separate shared secret for verification
- **External credentials** — stored in `.env` file, loaded at startup, `.gitignore`d
- **No secrets in the database** — the store holds personal data, not passwords or tokens

## Data Model

Hybrid approach: typed tables for known domains, plus a generic documents table with JSONB for flexible/unstructured data. New data types start as documents and graduate to typed tables when they mature.

### Health Domain

**health_metrics** — unified time-series table for all health data

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| source | TEXT | apple_health, aura, manual |
| metric_type | TEXT | heart_rate, steps, sleep_score, hrv, ... |
| value | NUMERIC | |
| unit | TEXT | bpm, count, score, ms, ... |
| recorded_at | TIMESTAMPTZ | |
| metadata | JSONB | Device info, raw payload extras |
| created_at | TIMESTAMPTZ | |

Indexes: `(metric_type, recorded_at)`, `(source, recorded_at)`

**supplements**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | |
| dosage | TEXT | |
| unit | TEXT | |
| taken_at | TIMESTAMPTZ | |
| source | TEXT | myfitnesspal, manual |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |

**nutrition_entries**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| meal_type | TEXT | breakfast, lunch, dinner, snack |
| foods | JSONB | Array of food items with macros |
| calories | NUMERIC | |
| protein | NUMERIC | |
| carbs | NUMERIC | |
| fat | NUMERIC | |
| recorded_at | TIMESTAMPTZ | |
| source | TEXT | myfitnesspal, manual |
| created_at | TIMESTAMPTZ | |

### Genomics Domain

**genomics_profiles** — one row per import

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| source | TEXT | 23andme, nebula, ancestry, ... |
| profile_type | TEXT | snp, trait, health_risk, carrier |
| imported_at | TIMESTAMPTZ | |
| raw_data | JSONB | Full parsed results |
| created_at | TIMESTAMPTZ | |

**genomics_variants** — queryable SNP data

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| profile_id | UUID FK → genomics_profiles | |
| rsid | TEXT | e.g. rs1234567 |
| chromosome | TEXT | |
| position | INTEGER | |
| genotype | TEXT | |
| gene | TEXT | |
| metadata | JSONB | Annotations, interpretations |

Indexes: `rsid`, `gene`

### Finance Domain — Crypto

**wallets**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| address | TEXT | |
| chain | TEXT | ethereum, solana, bitcoin, ... |
| label | TEXT | main, trading, cold, ... |
| created_at | TIMESTAMPTZ | |

**portfolio_snapshots** — point-in-time crypto portfolio state

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| wallet_id | UUID FK → wallets (nullable) | Null for aggregate snapshot |
| total_value_usd | NUMERIC | |
| positions | JSONB | Token balances, NFTs, DeFi positions |
| source | TEXT | zapper, debank, zerion |
| snapshot_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

Index: `(wallet_id, snapshot_at)`

### Finance Domain — Traditional

**financial_accounts**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| institution | TEXT | revolut, robinhood, fidelity, ... |
| account_name | TEXT | main checking, ISA, brokerage, ... |
| account_type | TEXT | checking, savings, brokerage, credit |
| currency | TEXT | USD, GBP, EUR, ... |
| metadata | JSONB | Account numbers last-4, etc. |
| created_at | TIMESTAMPTZ | |

**transactions**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID FK → financial_accounts | |
| date | DATE | |
| description | TEXT | |
| amount | NUMERIC | Negative = debit, positive = credit |
| currency | TEXT | |
| category | TEXT (nullable) | Can be enriched later by agent |
| balance_after | NUMERIC (nullable) | If available from source |
| source | TEXT | csv_import, open_banking, manual |
| source_ref | TEXT (nullable) | Original txn ID from bank |
| metadata | JSONB | Raw row from CSV, extra fields |
| created_at | TIMESTAMPTZ | |

Indexes: `(account_id, date)`, `category`
Unique constraint: `(account_id, source_ref) WHERE source_ref IS NOT NULL`

**holdings** — point-in-time brokerage positions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID FK → financial_accounts | |
| symbol | TEXT | AAPL, VTI, ... |
| quantity | NUMERIC | |
| cost_basis | NUMERIC (nullable) | |
| market_value | NUMERIC | |
| currency | TEXT | |
| snapshot_at | TIMESTAMPTZ | |
| source | TEXT | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |

Index: `(account_id, snapshot_at)`

**account_balance_history**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID FK → financial_accounts | |
| balance | NUMERIC | |
| currency | TEXT | |
| snapshot_at | TIMESTAMPTZ | |
| source | TEXT | |
| created_at | TIMESTAMPTZ | |

Index: `(account_id, snapshot_at)`

### Business Domain

**clients**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | |
| contact_info | JSONB | |
| status | TEXT | active, inactive, prospect |
| created_at | TIMESTAMPTZ | |

**projects**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | UUID FK → clients | |
| name | TEXT | |
| status | TEXT | active, completed, paused |
| rate | JSONB | { amount, currency, type: hourly/fixed/retainer } |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**time_entries**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| description | TEXT | |
| hours | NUMERIC | |
| worked_at | DATE | |
| created_at | TIMESTAMPTZ | |

**invoices**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | UUID FK → clients | |
| project_id | UUID FK → projects (nullable) | |
| amount | NUMERIC | |
| currency | TEXT | |
| status | TEXT | draft, sent, paid, overdue |
| issued_at | DATE | |
| paid_at | DATE | |
| metadata | JSONB | Line items, notes, tax |
| created_at | TIMESTAMPTZ | |

**expenses**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| category | TEXT | |
| description | TEXT | |
| amount | NUMERIC | |
| currency | TEXT | |
| incurred_at | DATE | |
| tax_deductible | BOOLEAN | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |

### Documents Domain (flexible store)

**documents**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| domain | TEXT | email, notes, misc, ... |
| title | TEXT | |
| content | TEXT | |
| metadata | JSONB | from, to, date, tags, source, ... |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**embeddings**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| document_id | UUID FK → documents | |
| chunk_index | INTEGER | |
| chunk_text | TEXT | |
| embedding | VECTOR(1536) | Dimension configurable per embedding model |
| created_at | TIMESTAMPTZ | |

Index: `USING ivfflat ON embedding vector_cosine_ops`

### System

**connector_runs** — audit trail for every sync operation

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| connector | TEXT | apple_health, aura, mfp, crypto, gmail, ... |
| status | TEXT | running, success, failed |
| started_at | TIMESTAMPTZ | |
| finished_at | TIMESTAMPTZ | |
| records_synced | INTEGER | |
| error | TEXT | |
| metadata | JSONB | |

## Connector Engine

Every connector implements:

```typescript
interface Connector {
  name: string;
  schedule: string | null; // cron expression, null for webhook/on-demand connectors
  sync(): Promise<SyncResult>;
}

interface SyncResult {
  recordsSynced: number;
  errors?: string[];
}
```

The connector runner wraps each `sync()` call: creates a `connector_runs` row on start, updates it on completion/failure, catches errors so a failing connector never crashes the service.

### Connectors

| Connector | Method | Schedule | Target Tables |
|-----------|--------|----------|---------------|
| apple_health | Webhook (POST /webhooks/apple-health) | Push-based (Health Auto Export iOS app) | health_metrics |
| aura | Poll Oura Cloud API v2 | Every 6 hours | health_metrics |
| myfitnesspal | Poll MFP API | Every 12 hours | nutrition_entries, supplements |
| crypto | Poll Zapper/DeBank API | Every 15 minutes | portfolio_snapshots |
| revolut | Open Banking API | Daily | transactions, account_balance_history |
| gmail | Gmail API (OAuth2) | Every hour | documents, embeddings |
| csv_import | On-demand upload | N/A (triggered via API) | transactions |

### Configuration

```typescript
// connectors.config.ts
{
  apple_health: { enabled: true, schedule: null },       // webhook, no poll
  aura:         { enabled: true, schedule: "0 */6 * * *" },
  myfitnesspal: { enabled: true, schedule: "0 */12 * * *" },
  crypto:       { enabled: true, schedule: "*/15 * * * *" },
  revolut:      { enabled: true, schedule: "0 2 * * *" },
  gmail:        { enabled: true, schedule: "0 * * * *" },
  csv_import:   { enabled: true, schedule: null },       // on-demand
}
```

## REST API

All endpoints require `Authorization: Bearer <API_KEY>` unless noted. All responses are JSON.

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health/metrics | Query metrics. Params: type, from, to, source |
| GET | /api/health/metrics/latest | Latest value for a metric type |
| GET | /api/health/supplements | Query supplements. Params: from, to |
| GET | /api/health/nutrition | Query nutrition. Params: from, to |
| POST | /api/health/metrics | Manual entry |
| POST | /api/health/supplements | Manual entry |

### Genomics

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/genomics/profiles | List imports |
| GET | /api/genomics/variants | Query variants. Params: rsid, gene, profile_id |
| POST | /api/genomics/import | Upload parsed genomics file |

### Finance

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/finance/accounts | List all financial accounts |
| GET | /api/finance/transactions | Query transactions. Params: account_id, from, to, category |
| GET | /api/finance/holdings | Query holdings. Params: account_id, latest |
| GET | /api/finance/balances | Balance history. Params: account_id, from, to |
| GET | /api/finance/wallets | List crypto wallets |
| GET | /api/finance/portfolio | Crypto portfolio. Params: wallet_id, latest |
| POST | /api/finance/accounts | Add financial account |
| POST | /api/finance/wallets | Add crypto wallet |
| POST | /api/finance/import/csv | Upload CSV (multipart). Auto-detects institution. |

### Business

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/business/clients | Query clients. Params: status |
| GET | /api/business/projects | Query projects. Params: client_id, status |
| GET | /api/business/time | Query time entries. Params: project_id, from, to |
| GET | /api/business/invoices | Query invoices. Params: client_id, status |
| GET | /api/business/expenses | Query expenses. Params: category, from, to |
| POST | /api/business/* | CRUD for all business entities |

### Documents & Search

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/documents | Query documents. Params: domain, from, to |
| GET | /api/documents/:id | Get single document |
| POST | /api/documents | Create document |
| POST | /api/documents/search | Semantic search. Body: { query, limit } |

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/system/connectors | Status of all connectors |
| GET | /api/system/connectors/:name/runs | Run history for a connector |
| POST | /api/system/connectors/:name/sync | Trigger manual sync |
| GET | /api/system/health | Service health check |

### Webhooks (separate auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | /webhooks/apple-health | Health Auto Export pushes here. Verified by webhook secret. |

## Project Structure

```
personal-data-store/
├── src/
│   ├── app.ts                       # Express app setup, middleware
│   ├── server.ts                    # Entry point — starts server + scheduler
│   ├── config.ts                    # Env vars, connector schedules, settings
│   │
│   ├── db/
│   │   ├── index.ts                 # Drizzle client + connection pool
│   │   ├── schema.ts               # Re-exports all domain schemas
│   │   └── migrations/             # Drizzle migration files
│   │
│   ├── middleware/
│   │   ├── auth.ts                  # API key verification
│   │   └── error-handler.ts        # Global error handling
│   │
│   ├── domains/
│   │   ├── health/
│   │   │   ├── health.schema.ts
│   │   │   ├── health.service.ts
│   │   │   └── health.routes.ts
│   │   ├── genomics/
│   │   │   ├── genomics.schema.ts
│   │   │   ├── genomics.service.ts
│   │   │   └── genomics.routes.ts
│   │   ├── finance/
│   │   │   ├── finance.schema.ts
│   │   │   ├── finance.service.ts
│   │   │   ├── finance.routes.ts
│   │   │   └── csv-parsers/
│   │   │       ├── revolut.ts
│   │   │       ├── robinhood.ts
│   │   │       └── fidelity.ts
│   │   ├── business/
│   │   │   ├── business.schema.ts
│   │   │   ├── business.service.ts
│   │   │   └── business.routes.ts
│   │   └── documents/
│   │       ├── documents.schema.ts
│   │       ├── documents.service.ts
│   │       ├── documents.routes.ts
│   │       └── embedding.ts
│   │
│   ├── connectors/
│   │   ├── connector.interface.ts
│   │   ├── connector.runner.ts
│   │   ├── scheduler.ts
│   │   ├── apple-health.connector.ts
│   │   ├── aura.connector.ts
│   │   ├── myfitnesspal.connector.ts
│   │   ├── crypto.connector.ts
│   │   ├── revolut.connector.ts
│   │   └── gmail.connector.ts
│   │
│   ├── webhooks/
│   │   └── apple-health.webhook.ts
│   │
│   └── system/
│       ├── system.schema.ts
│       ├── system.service.ts
│       └── system.routes.ts
│
├── tests/
│   ├── domains/
│   ├── connectors/
│   └── integration/
│
├── docs/
│   └── superpowers/specs/
│
├── .env.example
├── .gitignore
├── docker-compose.yml               # PostgreSQL + pgvector
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

## Testing Strategy

- **Unit tests** for domain services — test business logic with a test database
- **Integration tests** for API routes — test full request/response cycle
- **Connector tests** — test parsing and data mapping with fixture data (mock external API responses)
- **Test runner**: Vitest

## Environment Variables

```
# Service
PORT=3000
API_KEY=<generated-key>
WEBHOOK_SECRET=<generated-secret>

# Database
DATABASE_URL=postgresql://localhost:5432/personal_data_store

# Connectors
OURA_ACCESS_TOKEN=
MFP_API_KEY=
ZAPPER_API_KEY=
REVOLUT_CLIENT_ID=
REVOLUT_CLIENT_SECRET=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=

# Embeddings
ANTHROPIC_API_KEY=  # or OPENAI_API_KEY
```
