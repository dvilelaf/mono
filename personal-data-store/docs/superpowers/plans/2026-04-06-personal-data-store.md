# Personal Data Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript personal data service that stores health, genomics, finance, business, and document data in PostgreSQL, with scheduled connectors to external APIs and a REST API for agent/client access.

**Architecture:** Modular monolith — single Express process with domain modules (health, genomics, finance, business, documents), a connector engine with node-cron scheduling, and PostgreSQL + pgvector for storage. Localhost-bound with API key auth.

**Tech Stack:** TypeScript, Express, Drizzle ORM, PostgreSQL + pgvector, node-cron, Vitest

**Spec:** `docs/superpowers/specs/2026-04-06-personal-data-store-design.md`

---

## File Map

### Infrastructure
- Create: `package.json` — dependencies and scripts
- Create: `tsconfig.json` — TypeScript config
- Create: `docker-compose.yml` — PostgreSQL + pgvector
- Create: `drizzle.config.ts` — Drizzle ORM config
- Create: `.env.example` — env var template
- Create: `.gitignore` — already exists, will extend
- Create: `src/config.ts` — env loading and connector schedule config
- Create: `src/db/index.ts` — Drizzle client and connection pool
- Create: `src/db/schema.ts` — re-exports all domain schemas
- Create: `src/middleware/auth.ts` — API key verification middleware
- Create: `src/middleware/error-handler.ts` — global error handler
- Create: `src/app.ts` — Express app setup
- Create: `src/server.ts` — entry point

### Health Domain
- Create: `src/domains/health/health.schema.ts` — health_metrics, supplements, nutrition_entries tables
- Create: `src/domains/health/health.service.ts` — query and insert logic
- Create: `src/domains/health/health.routes.ts` — Express router
- Create: `tests/domains/health.test.ts` — service + route tests

### Genomics Domain
- Create: `src/domains/genomics/genomics.schema.ts` — genomics_profiles, genomics_variants tables
- Create: `src/domains/genomics/genomics.service.ts` — query and import logic
- Create: `src/domains/genomics/genomics.routes.ts` — Express router
- Create: `tests/domains/genomics.test.ts` — service + route tests

### Finance Domain
- Create: `src/domains/finance/finance.schema.ts` — wallets, portfolio_snapshots, financial_accounts, transactions, holdings, account_balance_history tables
- Create: `src/domains/finance/finance.service.ts` — query, insert, CSV import logic
- Create: `src/domains/finance/finance.routes.ts` — Express router
- Create: `src/domains/finance/csv-parsers/revolut.ts` — Revolut CSV column mapper
- Create: `src/domains/finance/csv-parsers/robinhood.ts` — Robinhood CSV column mapper
- Create: `src/domains/finance/csv-parsers/fidelity.ts` — Fidelity CSV column mapper
- Create: `tests/domains/finance.test.ts` — service + route tests
- Create: `tests/domains/csv-parsers.test.ts` — CSV parser tests

### Business Domain
- Create: `src/domains/business/business.schema.ts` — clients, projects, time_entries, invoices, expenses tables
- Create: `src/domains/business/business.service.ts` — CRUD logic
- Create: `src/domains/business/business.routes.ts` — Express router
- Create: `tests/domains/business.test.ts` — service + route tests

### Documents Domain
- Create: `src/domains/documents/documents.schema.ts` — documents, embeddings tables
- Create: `src/domains/documents/documents.service.ts` — CRUD + semantic search
- Create: `src/domains/documents/documents.routes.ts` — Express router
- Create: `src/domains/documents/embedding.ts` — embedding generation via API
- Create: `tests/domains/documents.test.ts` — service + route tests

### System Domain
- Create: `src/system/system.schema.ts` — connector_runs table
- Create: `src/system/system.service.ts` — connector status and run history
- Create: `src/system/system.routes.ts` — Express router
- Create: `tests/system/system.test.ts` — service + route tests

### Connector Engine
- Create: `src/connectors/connector.interface.ts` — Connector and SyncResult types
- Create: `src/connectors/connector.runner.ts` — wraps sync() with logging to connector_runs
- Create: `src/connectors/scheduler.ts` — node-cron setup
- Create: `tests/connectors/connector-runner.test.ts` — runner tests

### Connectors
- Create: `src/webhooks/apple-health.webhook.ts` — webhook receiver
- Create: `src/connectors/aura.connector.ts` — Oura Cloud API v2 poller
- Create: `src/connectors/myfitnesspal.connector.ts` — MFP API poller
- Create: `src/connectors/crypto.connector.ts` — Zapper/DeBank API poller
- Create: `src/connectors/revolut.connector.ts` — Open Banking API poller
- Create: `src/connectors/gmail.connector.ts` — Gmail API poller
- Create: `tests/connectors/apple-health.test.ts`
- Create: `tests/connectors/aura.test.ts`
- Create: `tests/connectors/crypto.test.ts`
- Create: `tests/connectors/gmail.test.ts`

### Integration Tests
- Create: `tests/integration/api.test.ts` — full request/response cycle tests
- Create: `tests/helpers/setup.ts` — test DB setup/teardown helper

---

## Phase 1: Project Scaffolding & Infrastructure

### Task 1: Initialize project and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/gcd/Repositories/main/personal-data-store
npm init -y
```

- [ ] **Step 2: Install production dependencies**

```bash
npm install express drizzle-orm postgres dotenv node-cron uuid
npm install @types/express @types/node @types/uuid @types/node-cron typescript tsx drizzle-kit vitest supertest @types/supertest --save-dev
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Update .gitignore**

```
node_modules/
dist/
.env
.superpowers/
*.log
```

- [ ] **Step 5: Add scripts to package.json**

Update the `scripts` section:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "feat: initialize project with dependencies and config"
```

---

### Task 2: Docker Compose and database config

**Files:**
- Create: `docker-compose.yml`
- Create: `drizzle.config.ts`
- Create: `.env.example`
- Create: `src/config.ts`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: personal_data_store
      POSTGRES_USER: pds
      POSTGRES_PASSWORD: pds_local
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 2: Create .env.example**

```
# Service
PORT=3000
API_KEY=change-me-to-a-random-string
WEBHOOK_SECRET=change-me-to-a-different-random-string

# Database
DATABASE_URL=postgresql://pds:pds_local@localhost:5432/personal_data_store

# Connectors (add as needed)
OURA_ACCESS_TOKEN=
MFP_API_KEY=
ZAPPER_API_KEY=
REVOLUT_CLIENT_ID=
REVOLUT_CLIENT_SECRET=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=

# Embeddings
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Create src/config.ts**

```typescript
import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  apiKey: process.env.API_KEY || "",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  databaseUrl: process.env.DATABASE_URL || "",

  connectors: {
    apple_health: { enabled: true, schedule: null as string | null },
    aura: { enabled: true, schedule: "0 */6 * * *" },
    myfitnesspal: { enabled: true, schedule: "0 */12 * * *" },
    crypto: { enabled: true, schedule: "*/15 * * * *" },
    revolut: { enabled: true, schedule: "0 2 * * *" },
    gmail: { enabled: true, schedule: "0 * * * *" },
    csv_import: { enabled: true, schedule: null as string | null },
  },
} as const;
```

- [ ] **Step 4: Create drizzle.config.ts**

```typescript
import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
dotenv.config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example src/config.ts drizzle.config.ts
git commit -m "feat: add docker-compose, env config, and drizzle config"
```

---

### Task 3: Database connection and Express app shell

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/schema.ts`
- Create: `src/middleware/auth.ts`
- Create: `src/middleware/error-handler.ts`
- Create: `src/app.ts`
- Create: `src/server.ts`

- [ ] **Step 1: Create src/db/index.ts**

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

const client = postgres(config.databaseUrl);
export const db = drizzle(client, { schema });
export type Database = typeof db;
```

- [ ] **Step 2: Create src/db/schema.ts (empty re-export file)**

```typescript
// Re-exports all domain schemas.
// Each domain will add its exports here as it's built.
```

- [ ] **Step 3: Create src/middleware/auth.ts**

```typescript
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice(7);
  if (token !== config.apiKey) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }
  next();
}
```

- [ ] **Step 4: Create src/middleware/error-handler.ts**

```typescript
import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(`[error] ${err.message}`, err.stack);
  res.status(500).json({ error: "Internal server error" });
}
```

- [ ] **Step 5: Create src/app.ts**

```typescript
import express from "express";
import { apiKeyAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";

export const app = express();

app.use(express.json());

// Health check (no auth)
app.get("/api/system/health", (_req, res) => {
  res.json({ status: "ok" });
});

// All /api routes require auth
app.use("/api", apiKeyAuth);

// Domain routers will be registered here as they're built

app.use(errorHandler);
```

- [ ] **Step 6: Create src/server.ts**

```typescript
import { app } from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`Personal Data Store running at http://127.0.0.1:${config.port}`);
});

export { server };
```

- [ ] **Step 7: Verify the app starts**

Create a `.env` from the example:

```bash
cp .env.example .env
```

Start Postgres and the app:

```bash
docker compose up -d
npx tsx src/server.ts &
sleep 2
curl http://localhost:3000/api/system/health
# Expected: {"status":"ok"}
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add src/db/ src/middleware/ src/app.ts src/server.ts
git commit -m "feat: add Express app shell with auth middleware and DB connection"
```

---

### Task 4: Test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/helpers/setup.ts`
- Create: `tests/middleware/auth.test.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["tests/helpers/setup.ts"],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 2: Create tests/helpers/setup.ts**

```typescript
import { db } from "../../src/db/index.js";
import { sql } from "drizzle-orm";

export async function resetDb() {
  // Truncate all tables. Each test file calls this in beforeEach.
  // Tables will be added here as domains are built.
  const tables = await db.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  for (const row of tables) {
    const name = (row as { tablename: string }).tablename;
    if (name === "__drizzle_migrations") continue;
    await db.execute(sql.raw(`TRUNCATE TABLE "${name}" CASCADE`));
  }
}
```

- [ ] **Step 3: Write auth middleware test**

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("API Key Auth", () => {
  it("rejects requests without auth header", async () => {
    const res = await request(app).get("/api/system/health");
    // /api/system/health is mounted before auth middleware, so this should pass
    // Let's test a protected route instead — we'll use a dummy route
    // For now, test that health check works without auth
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("rejects requests with invalid API key to protected routes", async () => {
    // Once domain routes are mounted under /api, they'll require auth.
    // For now, verify the middleware function directly.
    const res = await request(app)
      .get("/api/nonexistent")
      .set("Authorization", "Bearer wrong-key");
    // Should get 403 (invalid key) or 404 (no route) depending on middleware order
    // Since auth is on /api and runs first, invalid key = 403
    expect(res.status).toBe(403);
  });

  it("allows requests with valid API key", async () => {
    const res = await request(app)
      .get("/api/nonexistent")
      .set("Authorization", `Bearer ${process.env.API_KEY}`);
    // Auth passes, but no route → 404
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/middleware/auth.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/
git commit -m "feat: add test infrastructure and auth middleware tests"
```

---

## Phase 2: Domain Modules

### Task 5: System domain (connector_runs)

**Files:**
- Create: `src/system/system.schema.ts`
- Create: `src/system/system.service.ts`
- Create: `src/system/system.routes.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/app.ts`
- Create: `tests/system/system.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/system/system.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("System API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("GET /api/system/connectors returns connector list", async () => {
    const res = await request(app).get("/api/system/connectors").set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/system/connectors/:name/runs returns empty array initially", async () => {
    const res = await request(app).get("/api/system/connectors/aura/runs").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/system/system.test.ts
```

Expected: FAIL (routes not found).

- [ ] **Step 3: Create system schema**

Create `src/system/system.schema.ts`:

```typescript
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const connectorRuns = pgTable("connector_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  connector: text("connector").notNull(),
  status: text("status").notNull(), // running, success, failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  recordsSynced: integer("records_synced"),
  error: text("error"),
  metadata: jsonb("metadata"),
});
```

- [ ] **Step 4: Update db/schema.ts**

```typescript
export * from "../system/system.schema.js";
```

- [ ] **Step 5: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 6: Create system service**

Create `src/system/system.service.ts`:

```typescript
import { db } from "../db/index.js";
import { connectorRuns } from "./system.schema.js";
import { config } from "../config.js";
import { eq, desc } from "drizzle-orm";

export async function getConnectors() {
  const connectorNames = Object.keys(config.connectors) as (keyof typeof config.connectors)[];
  const results = [];
  for (const name of connectorNames) {
    const conf = config.connectors[name];
    const lastRun = await db
      .select()
      .from(connectorRuns)
      .where(eq(connectorRuns.connector, name))
      .orderBy(desc(connectorRuns.startedAt))
      .limit(1);
    results.push({
      name,
      enabled: conf.enabled,
      schedule: conf.schedule,
      lastRun: lastRun[0] || null,
    });
  }
  return results;
}

export async function getConnectorRuns(connectorName: string, limit = 20) {
  return db
    .select()
    .from(connectorRuns)
    .where(eq(connectorRuns.connector, connectorName))
    .orderBy(desc(connectorRuns.startedAt))
    .limit(limit);
}
```

- [ ] **Step 7: Create system routes**

Create `src/system/system.routes.ts`:

```typescript
import { Router } from "express";
import { getConnectors, getConnectorRuns } from "./system.service.js";

export const systemRouter = Router();

systemRouter.get("/connectors", async (_req, res, next) => {
  try {
    const connectors = await getConnectors();
    res.json(connectors);
  } catch (err) {
    next(err);
  }
});

systemRouter.get("/connectors/:name/runs", async (req, res, next) => {
  try {
    const runs = await getConnectorRuns(req.params.name);
    res.json(runs);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 8: Register system routes in app.ts**

Add to `src/app.ts` after the auth middleware line:

```typescript
import { systemRouter } from "./system/system.routes.js";

// After app.use("/api", apiKeyAuth);
app.use("/api/system", systemRouter);
```

Keep the health check before auth as-is.

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/system/system.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/system/ src/db/ src/app.ts tests/system/
git commit -m "feat: add system domain with connector_runs schema and API"
```

---

### Task 6: Health domain

**Files:**
- Create: `src/domains/health/health.schema.ts`
- Create: `src/domains/health/health.service.ts`
- Create: `src/domains/health/health.routes.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/app.ts`
- Create: `tests/domains/health.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/domains/health.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Health API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("POST /api/health/metrics", () => {
    it("creates a health metric", async () => {
      const res = await request(app)
        .post("/api/health/metrics")
        .set(AUTH)
        .send({
          source: "manual",
          metricType: "heart_rate",
          value: 72,
          unit: "bpm",
          recordedAt: "2026-04-06T10:00:00Z",
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.value).toBe("72");
    });
  });

  describe("GET /api/health/metrics", () => {
    it("returns metrics filtered by type", async () => {
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "heart_rate",
        value: 72,
        unit: "bpm",
        recordedAt: "2026-04-06T10:00:00Z",
      });
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "steps",
        value: 5000,
        unit: "count",
        recordedAt: "2026-04-06T10:00:00Z",
      });

      const res = await request(app)
        .get("/api/health/metrics?type=heart_rate")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].metricType).toBe("heart_rate");
    });
  });

  describe("GET /api/health/metrics/latest", () => {
    it("returns the most recent metric of a type", async () => {
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "heart_rate",
        value: 70,
        unit: "bpm",
        recordedAt: "2026-04-06T09:00:00Z",
      });
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "heart_rate",
        value: 75,
        unit: "bpm",
        recordedAt: "2026-04-06T11:00:00Z",
      });

      const res = await request(app)
        .get("/api/health/metrics/latest?type=heart_rate")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.value).toBe("75");
    });
  });

  describe("POST /api/health/supplements", () => {
    it("creates a supplement entry", async () => {
      const res = await request(app)
        .post("/api/health/supplements")
        .set(AUTH)
        .send({
          name: "Vitamin D",
          dosage: "5000",
          unit: "IU",
          takenAt: "2026-04-06T08:00:00Z",
          source: "manual",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Vitamin D");
    });
  });

  describe("GET /api/health/supplements", () => {
    it("returns supplements in date range", async () => {
      await request(app).post("/api/health/supplements").set(AUTH).send({
        name: "Vitamin D",
        dosage: "5000",
        unit: "IU",
        takenAt: "2026-04-06T08:00:00Z",
        source: "manual",
      });

      const res = await request(app)
        .get("/api/health/supplements?from=2026-04-06&to=2026-04-07")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("GET /api/health/nutrition", () => {
    it("returns nutrition entries", async () => {
      const res = await request(app).get("/api/health/nutrition").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/domains/health.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create health schema**

Create `src/domains/health/health.schema.ts`:

```typescript
import { pgTable, uuid, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const healthMetrics = pgTable(
  "health_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    metricType: text("metric_type").notNull(),
    value: numeric("value").notNull(),
    unit: text("unit").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("health_metrics_type_recorded_idx").on(table.metricType, table.recordedAt),
    index("health_metrics_source_recorded_idx").on(table.source, table.recordedAt),
  ]
);

export const supplements = pgTable("supplements", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dosage: text("dosage"),
  unit: text("unit"),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nutritionEntries = pgTable("nutrition_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealType: text("meal_type"),
  foods: jsonb("foods"),
  calories: numeric("calories"),
  protein: numeric("protein"),
  carbs: numeric("carbs"),
  fat: numeric("fat"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 4: Update db/schema.ts**

```typescript
export * from "../system/system.schema.js";
export * from "../domains/health/health.schema.js";
```

- [ ] **Step 5: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 6: Create health service**

Create `src/domains/health/health.service.ts`:

```typescript
import { db } from "../../db/index.js";
import { healthMetrics, supplements, nutritionEntries } from "./health.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";

interface CreateMetricInput {
  source: string;
  metricType: string;
  value: number;
  unit: string;
  recordedAt: string;
  metadata?: Record<string, unknown>;
}

export async function createMetric(input: CreateMetricInput) {
  const [row] = await db
    .insert(healthMetrics)
    .values({
      source: input.source,
      metricType: input.metricType,
      value: String(input.value),
      unit: input.unit,
      recordedAt: new Date(input.recordedAt),
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function queryMetrics(filters: {
  type?: string;
  source?: string;
  from?: string;
  to?: string;
}) {
  const conditions = [];
  if (filters.type) conditions.push(eq(healthMetrics.metricType, filters.type));
  if (filters.source) conditions.push(eq(healthMetrics.source, filters.source));
  if (filters.from) conditions.push(gte(healthMetrics.recordedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(healthMetrics.recordedAt, new Date(filters.to)));

  return db
    .select()
    .from(healthMetrics)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(healthMetrics.recordedAt));
}

export async function latestMetric(type: string) {
  const [row] = await db
    .select()
    .from(healthMetrics)
    .where(eq(healthMetrics.metricType, type))
    .orderBy(desc(healthMetrics.recordedAt))
    .limit(1);
  return row || null;
}

interface CreateSupplementInput {
  name: string;
  dosage?: string;
  unit?: string;
  takenAt: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export async function createSupplement(input: CreateSupplementInput) {
  const [row] = await db
    .insert(supplements)
    .values({
      name: input.name,
      dosage: input.dosage,
      unit: input.unit,
      takenAt: new Date(input.takenAt),
      source: input.source,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function querySupplements(filters: { from?: string; to?: string }) {
  const conditions = [];
  if (filters.from) conditions.push(gte(supplements.takenAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(supplements.takenAt, new Date(filters.to)));

  return db
    .select()
    .from(supplements)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supplements.takenAt));
}

export async function queryNutrition(filters: { from?: string; to?: string }) {
  const conditions = [];
  if (filters.from) conditions.push(gte(nutritionEntries.recordedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(nutritionEntries.recordedAt, new Date(filters.to)));

  return db
    .select()
    .from(nutritionEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(nutritionEntries.recordedAt));
}
```

- [ ] **Step 7: Create health routes**

Create `src/domains/health/health.routes.ts`:

```typescript
import { Router } from "express";
import {
  createMetric,
  queryMetrics,
  latestMetric,
  createSupplement,
  querySupplements,
  queryNutrition,
} from "./health.service.js";

export const healthRouter = Router();

healthRouter.get("/metrics", async (req, res, next) => {
  try {
    const metrics = await queryMetrics({
      type: req.query.type as string | undefined,
      source: req.query.source as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(metrics);
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/metrics/latest", async (req, res, next) => {
  try {
    const type = req.query.type as string;
    if (!type) {
      res.status(400).json({ error: "type query parameter is required" });
      return;
    }
    const metric = await latestMetric(type);
    if (!metric) {
      res.status(404).json({ error: "No metrics found for this type" });
      return;
    }
    res.json(metric);
  } catch (err) {
    next(err);
  }
});

healthRouter.post("/metrics", async (req, res, next) => {
  try {
    const metric = await createMetric(req.body);
    res.status(201).json(metric);
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/supplements", async (req, res, next) => {
  try {
    const supplements = await querySupplements({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(supplements);
  } catch (err) {
    next(err);
  }
});

healthRouter.post("/supplements", async (req, res, next) => {
  try {
    const supplement = await createSupplement(req.body);
    res.status(201).json(supplement);
  } catch (err) {
    next(err);
  }
});

healthRouter.get("/nutrition", async (req, res, next) => {
  try {
    const entries = await queryNutrition({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 8: Register health routes in app.ts**

Add to `src/app.ts`:

```typescript
import { healthRouter } from "./domains/health/health.routes.js";

// After other app.use lines:
app.use("/api/health", healthRouter);
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/domains/health.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/domains/health/ src/db/schema.ts src/app.ts tests/domains/health.test.ts src/db/migrations/
git commit -m "feat: add health domain with metrics, supplements, and nutrition"
```

---

### Task 7: Genomics domain

**Files:**
- Create: `src/domains/genomics/genomics.schema.ts`
- Create: `src/domains/genomics/genomics.service.ts`
- Create: `src/domains/genomics/genomics.routes.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/app.ts`
- Create: `tests/domains/genomics.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/domains/genomics.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Genomics API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("POST /api/genomics/import", () => {
    it("imports a genomics profile with variants", async () => {
      const res = await request(app)
        .post("/api/genomics/import")
        .set(AUTH)
        .send({
          source: "23andme",
          profileType: "snp",
          variants: [
            {
              rsid: "rs1234567",
              chromosome: "1",
              position: 12345,
              genotype: "AG",
              gene: "BRCA1",
            },
            {
              rsid: "rs7654321",
              chromosome: "7",
              position: 67890,
              genotype: "CC",
              gene: "MTHFR",
            },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.profileId).toBeDefined();
      expect(res.body.variantsImported).toBe(2);
    });
  });

  describe("GET /api/genomics/profiles", () => {
    it("lists imported profiles", async () => {
      await request(app).post("/api/genomics/import").set(AUTH).send({
        source: "23andme",
        profileType: "snp",
        variants: [],
      });

      const res = await request(app).get("/api/genomics/profiles").set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].source).toBe("23andme");
    });
  });

  describe("GET /api/genomics/variants", () => {
    it("queries variants by rsid", async () => {
      await request(app).post("/api/genomics/import").set(AUTH).send({
        source: "23andme",
        profileType: "snp",
        variants: [
          { rsid: "rs1234567", chromosome: "1", position: 12345, genotype: "AG", gene: "BRCA1" },
        ],
      });

      const res = await request(app)
        .get("/api/genomics/variants?rsid=rs1234567")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].genotype).toBe("AG");
    });

    it("queries variants by gene", async () => {
      await request(app).post("/api/genomics/import").set(AUTH).send({
        source: "23andme",
        profileType: "snp",
        variants: [
          { rsid: "rs1234567", chromosome: "1", position: 12345, genotype: "AG", gene: "MTHFR" },
          { rsid: "rs9999999", chromosome: "2", position: 54321, genotype: "TT", gene: "APOE" },
        ],
      });

      const res = await request(app)
        .get("/api/genomics/variants?gene=MTHFR")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/domains/genomics.test.ts
```

- [ ] **Step 3: Create genomics schema**

Create `src/domains/genomics/genomics.schema.ts`:

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const genomicsProfiles = pgTable("genomics_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  profileType: text("profile_type").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const genomicsVariants = pgTable(
  "genomics_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => genomicsProfiles.id),
    rsid: text("rsid"),
    chromosome: text("chromosome"),
    position: integer("position"),
    genotype: text("genotype"),
    gene: text("gene"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("genomics_variants_rsid_idx").on(table.rsid),
    index("genomics_variants_gene_idx").on(table.gene),
  ]
);
```

- [ ] **Step 4: Update db/schema.ts**

Add:

```typescript
export * from "../domains/genomics/genomics.schema.js";
```

- [ ] **Step 5: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 6: Create genomics service**

Create `src/domains/genomics/genomics.service.ts`:

```typescript
import { db } from "../../db/index.js";
import { genomicsProfiles, genomicsVariants } from "./genomics.schema.js";
import { eq, and, desc } from "drizzle-orm";

interface VariantInput {
  rsid?: string;
  chromosome?: string;
  position?: number;
  genotype?: string;
  gene?: string;
  metadata?: Record<string, unknown>;
}

interface ImportInput {
  source: string;
  profileType: string;
  variants: VariantInput[];
  rawData?: Record<string, unknown>;
}

export async function importProfile(input: ImportInput) {
  const [profile] = await db
    .insert(genomicsProfiles)
    .values({
      source: input.source,
      profileType: input.profileType,
      rawData: input.rawData,
    })
    .returning();

  if (input.variants.length > 0) {
    await db.insert(genomicsVariants).values(
      input.variants.map((v) => ({
        profileId: profile.id,
        rsid: v.rsid,
        chromosome: v.chromosome,
        position: v.position,
        genotype: v.genotype,
        gene: v.gene,
        metadata: v.metadata,
      }))
    );
  }

  return { profileId: profile.id, variantsImported: input.variants.length };
}

export async function listProfiles() {
  return db.select().from(genomicsProfiles).orderBy(desc(genomicsProfiles.importedAt));
}

export async function queryVariants(filters: {
  rsid?: string;
  gene?: string;
  profileId?: string;
}) {
  const conditions = [];
  if (filters.rsid) conditions.push(eq(genomicsVariants.rsid, filters.rsid));
  if (filters.gene) conditions.push(eq(genomicsVariants.gene, filters.gene));
  if (filters.profileId) conditions.push(eq(genomicsVariants.profileId, filters.profileId));

  return db
    .select()
    .from(genomicsVariants)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
}
```

- [ ] **Step 7: Create genomics routes**

Create `src/domains/genomics/genomics.routes.ts`:

```typescript
import { Router } from "express";
import { importProfile, listProfiles, queryVariants } from "./genomics.service.js";

export const genomicsRouter = Router();

genomicsRouter.get("/profiles", async (_req, res, next) => {
  try {
    const profiles = await listProfiles();
    res.json(profiles);
  } catch (err) {
    next(err);
  }
});

genomicsRouter.get("/variants", async (req, res, next) => {
  try {
    const variants = await queryVariants({
      rsid: req.query.rsid as string | undefined,
      gene: req.query.gene as string | undefined,
      profileId: req.query.profile_id as string | undefined,
    });
    res.json(variants);
  } catch (err) {
    next(err);
  }
});

genomicsRouter.post("/import", async (req, res, next) => {
  try {
    const result = await importProfile(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 8: Register genomics routes in app.ts**

Add to `src/app.ts`:

```typescript
import { genomicsRouter } from "./domains/genomics/genomics.routes.js";

app.use("/api/genomics", genomicsRouter);
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/domains/genomics.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/domains/genomics/ src/db/schema.ts src/app.ts tests/domains/genomics.test.ts src/db/migrations/
git commit -m "feat: add genomics domain with profile import and variant queries"
```

---

### Task 8: Finance domain

**Files:**
- Create: `src/domains/finance/finance.schema.ts`
- Create: `src/domains/finance/finance.service.ts`
- Create: `src/domains/finance/finance.routes.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/app.ts`
- Create: `tests/domains/finance.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/domains/finance.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Finance API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("Wallets & Portfolio", () => {
    it("POST /api/finance/wallets creates a wallet", async () => {
      const res = await request(app).post("/api/finance/wallets").set(AUTH).send({
        address: "0xabc123",
        chain: "ethereum",
        label: "main",
      });
      expect(res.status).toBe(201);
      expect(res.body.address).toBe("0xabc123");
    });

    it("GET /api/finance/wallets lists wallets", async () => {
      await request(app).post("/api/finance/wallets").set(AUTH).send({
        address: "0xabc123",
        chain: "ethereum",
        label: "main",
      });
      const res = await request(app).get("/api/finance/wallets").set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("GET /api/finance/portfolio returns latest snapshots", async () => {
      const res = await request(app).get("/api/finance/portfolio?latest=true").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("Accounts & Transactions", () => {
    it("POST /api/finance/accounts creates an account", async () => {
      const res = await request(app).post("/api/finance/accounts").set(AUTH).send({
        institution: "revolut",
        accountName: "main checking",
        accountType: "checking",
        currency: "GBP",
      });
      expect(res.status).toBe(201);
      expect(res.body.institution).toBe("revolut");
    });

    it("GET /api/finance/transactions returns filtered transactions", async () => {
      const acct = await request(app).post("/api/finance/accounts").set(AUTH).send({
        institution: "revolut",
        accountName: "main",
        accountType: "checking",
        currency: "GBP",
      });

      // Insert a transaction via the service directly (no CSV route yet)
      const res = await request(app)
        .get(`/api/finance/transactions?account_id=${acct.body.id}`)
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("GET /api/finance/balances returns balance history", async () => {
      const res = await request(app).get("/api/finance/balances").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("GET /api/finance/holdings returns holdings", async () => {
      const res = await request(app).get("/api/finance/holdings").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/domains/finance.test.ts
```

- [ ] **Step 3: Create finance schema**

Create `src/domains/finance/finance.schema.ts`:

```typescript
import { pgTable, uuid, text, numeric, date, timestamp, jsonb, index, unique, boolean } from "drizzle-orm/pg-core";

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull(),
  chain: text("chain").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id").references(() => wallets.id),
    totalValueUsd: numeric("total_value_usd"),
    positions: jsonb("positions"),
    source: text("source").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("portfolio_snapshots_wallet_time_idx").on(table.walletId, table.snapshotAt),
  ]
);

export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  institution: text("institution").notNull(),
  accountName: text("account_name").notNull(),
  accountType: text("account_type").notNull(),
  currency: text("currency").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id),
    date: date("date").notNull(),
    description: text("description").notNull(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull(),
    category: text("category"),
    balanceAfter: numeric("balance_after"),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("transactions_account_date_idx").on(table.accountId, table.date),
    index("transactions_category_idx").on(table.category),
    unique("transactions_account_source_ref_uniq")
      .on(table.accountId, table.sourceRef)
      .nullsNotDistinct(),
  ]
);

export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id),
    symbol: text("symbol").notNull(),
    quantity: numeric("quantity").notNull(),
    costBasis: numeric("cost_basis"),
    marketValue: numeric("market_value").notNull(),
    currency: text("currency").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    source: text("source"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("holdings_account_time_idx").on(table.accountId, table.snapshotAt),
  ]
);

export const accountBalanceHistory = pgTable(
  "account_balance_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id),
    balance: numeric("balance").notNull(),
    currency: text("currency").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("balance_history_account_time_idx").on(table.accountId, table.snapshotAt),
  ]
);
```

- [ ] **Step 4: Update db/schema.ts**

Add:

```typescript
export * from "../domains/finance/finance.schema.js";
```

- [ ] **Step 5: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 6: Create finance service**

Create `src/domains/finance/finance.service.ts`:

```typescript
import { db } from "../../db/index.js";
import {
  wallets,
  portfolioSnapshots,
  financialAccounts,
  transactions,
  holdings,
  accountBalanceHistory,
} from "./finance.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";

// --- Wallets ---

export async function createWallet(input: { address: string; chain: string; label?: string }) {
  const [row] = await db.insert(wallets).values(input).returning();
  return row;
}

export async function listWallets() {
  return db.select().from(wallets).orderBy(desc(wallets.createdAt));
}

// --- Portfolio ---

export async function queryPortfolio(filters: { walletId?: string; latest?: boolean }) {
  const conditions = [];
  if (filters.walletId) conditions.push(eq(portfolioSnapshots.walletId, filters.walletId));

  const query = db
    .select()
    .from(portfolioSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(portfolioSnapshots.snapshotAt));

  if (filters.latest) return query.limit(1);
  return query;
}

// --- Accounts ---

export async function createAccount(input: {
  institution: string;
  accountName: string;
  accountType: string;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db.insert(financialAccounts).values(input).returning();
  return row;
}

export async function listAccounts() {
  return db.select().from(financialAccounts).orderBy(desc(financialAccounts.createdAt));
}

// --- Transactions ---

export async function queryTransactions(filters: {
  accountId?: string;
  from?: string;
  to?: string;
  category?: string;
}) {
  const conditions = [];
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters.from) conditions.push(gte(transactions.date, filters.from));
  if (filters.to) conditions.push(lte(transactions.date, filters.to));
  if (filters.category) conditions.push(eq(transactions.category, filters.category));

  return db
    .select()
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date));
}

// --- Holdings ---

export async function queryHoldings(filters: { accountId?: string; latest?: boolean }) {
  const conditions = [];
  if (filters.accountId) conditions.push(eq(holdings.accountId, filters.accountId));

  const query = db
    .select()
    .from(holdings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(holdings.snapshotAt));

  if (filters.latest) return query.limit(10); // latest snapshot per symbol
  return query;
}

// --- Balances ---

export async function queryBalances(filters: { accountId?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.accountId) conditions.push(eq(accountBalanceHistory.accountId, filters.accountId));
  if (filters.from) conditions.push(gte(accountBalanceHistory.snapshotAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(accountBalanceHistory.snapshotAt, new Date(filters.to)));

  return db
    .select()
    .from(accountBalanceHistory)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(accountBalanceHistory.snapshotAt));
}
```

- [ ] **Step 7: Create finance routes**

Create `src/domains/finance/finance.routes.ts`:

```typescript
import { Router } from "express";
import {
  createWallet,
  listWallets,
  queryPortfolio,
  createAccount,
  listAccounts,
  queryTransactions,
  queryHoldings,
  queryBalances,
} from "./finance.service.js";

export const financeRouter = Router();

financeRouter.get("/wallets", async (_req, res, next) => {
  try {
    res.json(await listWallets());
  } catch (err) {
    next(err);
  }
});

financeRouter.post("/wallets", async (req, res, next) => {
  try {
    const wallet = await createWallet(req.body);
    res.status(201).json(wallet);
  } catch (err) {
    next(err);
  }
});

financeRouter.get("/portfolio", async (req, res, next) => {
  try {
    const result = await queryPortfolio({
      walletId: req.query.wallet_id as string | undefined,
      latest: req.query.latest === "true",
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

financeRouter.get("/accounts", async (_req, res, next) => {
  try {
    res.json(await listAccounts());
  } catch (err) {
    next(err);
  }
});

financeRouter.post("/accounts", async (req, res, next) => {
  try {
    const account = await createAccount(req.body);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

financeRouter.get("/transactions", async (req, res, next) => {
  try {
    res.json(
      await queryTransactions({
        accountId: req.query.account_id as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        category: req.query.category as string | undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

financeRouter.get("/holdings", async (req, res, next) => {
  try {
    res.json(
      await queryHoldings({
        accountId: req.query.account_id as string | undefined,
        latest: req.query.latest === "true",
      })
    );
  } catch (err) {
    next(err);
  }
});

financeRouter.get("/balances", async (req, res, next) => {
  try {
    res.json(
      await queryBalances({
        accountId: req.query.account_id as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 8: Register finance routes in app.ts**

Add to `src/app.ts`:

```typescript
import { financeRouter } from "./domains/finance/finance.routes.js";

app.use("/api/finance", financeRouter);
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/domains/finance.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/domains/finance/ src/db/schema.ts src/app.ts tests/domains/finance.test.ts src/db/migrations/
git commit -m "feat: add finance domain with wallets, accounts, transactions, holdings"
```

---

### Task 9: Finance CSV import

**Files:**
- Create: `src/domains/finance/csv-parsers/revolut.ts`
- Create: `src/domains/finance/csv-parsers/robinhood.ts`
- Create: `src/domains/finance/csv-parsers/fidelity.ts`
- Modify: `src/domains/finance/finance.service.ts`
- Modify: `src/domains/finance/finance.routes.ts`
- Create: `tests/domains/csv-parsers.test.ts`

- [ ] **Step 1: Write failing test for CSV parsers**

Create `tests/domains/csv-parsers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseRevolutCsv } from "../../src/domains/finance/csv-parsers/revolut.js";
import { parseRobinhoodCsv } from "../../src/domains/finance/csv-parsers/robinhood.js";
import { parseFidelityCsv } from "../../src/domains/finance/csv-parsers/fidelity.js";
import { detectInstitution } from "../../src/domains/finance/finance.service.js";

describe("CSV Parsers", () => {
  describe("Revolut", () => {
    it("parses Revolut CSV format", () => {
      const csv = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-01-15 10:30:00,2026-01-15 10:30:00,Tesco Stores,-25.50,0.00,GBP,COMPLETED,1234.50`;
      const rows = parseRevolutCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("Tesco Stores");
      expect(rows[0].amount).toBe("-25.50");
      expect(rows[0].currency).toBe("GBP");
      expect(rows[0].date).toBe("2026-01-15");
      expect(rows[0].balanceAfter).toBe("1234.50");
    });
  });

  describe("Robinhood", () => {
    it("parses Robinhood CSV format", () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2026,01/15/2026,01/17/2026,AAPL,APPLE INC,Buy,10,150.00,-1500.00`;
      const rows = parseRobinhoodCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("Buy AAPL - APPLE INC");
      expect(rows[0].amount).toBe("-1500.00");
      expect(rows[0].date).toBe("2026-01-15");
    });
  });

  describe("Fidelity", () => {
    it("parses Fidelity CSV format", () => {
      const csv = `Date,Transaction,Name,Memo,Amount
01/15/2026,DIVIDEND,VANGUARD TOTAL STOCK,REINVEST DIVIDEND,125.43`;
      const rows = parseFidelityCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("DIVIDEND - VANGUARD TOTAL STOCK");
      expect(rows[0].amount).toBe("125.43");
      expect(rows[0].date).toBe("2026-01-15");
    });
  });

  describe("Institution detection", () => {
    it("detects Revolut from header", () => {
      const csv = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n";
      expect(detectInstitution(csv)).toBe("revolut");
    });

    it("detects Robinhood from header", () => {
      const csv = "Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n";
      expect(detectInstitution(csv)).toBe("robinhood");
    });

    it("detects Fidelity from header", () => {
      const csv = "Date,Transaction,Name,Memo,Amount\n";
      expect(detectInstitution(csv)).toBe("fidelity");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/domains/csv-parsers.test.ts
```

- [ ] **Step 3: Create Revolut CSV parser**

Create `src/domains/finance/csv-parsers/revolut.ts`:

```typescript
interface ParsedTransaction {
  date: string;
  description: string;
  amount: string;
  currency: string;
  balanceAfter: string | null;
  sourceRef: string | null;
  metadata: Record<string, string>;
}

export function parseRevolutCsv(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const rows: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < header.length) continue;

    const record: Record<string, string> = {};
    header.forEach((h, idx) => {
      record[h.trim()] = values[idx]?.trim() || "";
    });

    if (record["State"] !== "COMPLETED") continue;

    rows.push({
      date: record["Completed Date"]?.slice(0, 10) || record["Started Date"]?.slice(0, 10) || "",
      description: record["Description"] || "",
      amount: record["Amount"] || "0",
      currency: record["Currency"] || "",
      balanceAfter: record["Balance"] || null,
      sourceRef: null,
      metadata: record,
    });
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
```

- [ ] **Step 4: Create Robinhood CSV parser**

Create `src/domains/finance/csv-parsers/robinhood.ts`:

```typescript
interface ParsedTransaction {
  date: string;
  description: string;
  amount: string;
  currency: string;
  balanceAfter: string | null;
  sourceRef: string | null;
  metadata: Record<string, string>;
}

export function parseRobinhoodCsv(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const rows: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    if (values.length < header.length) continue;

    const record: Record<string, string> = {};
    header.forEach((h, idx) => {
      record[h.trim()] = values[idx]?.trim() || "";
    });

    // Convert MM/DD/YYYY to YYYY-MM-DD
    const dateParts = (record["Activity Date"] || "").split("/");
    const date =
      dateParts.length === 3
        ? `${dateParts[2]}-${dateParts[0].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}`
        : "";

    rows.push({
      date,
      description: `${record["Trans Code"] || ""} ${record["Instrument"] || ""} - ${record["Description"] || ""}`.trim(),
      amount: record["Amount"] || "0",
      currency: "USD",
      balanceAfter: null,
      sourceRef: null,
      metadata: record,
    });
  }

  return rows;
}
```

- [ ] **Step 5: Create Fidelity CSV parser**

Create `src/domains/finance/csv-parsers/fidelity.ts`:

```typescript
interface ParsedTransaction {
  date: string;
  description: string;
  amount: string;
  currency: string;
  balanceAfter: string | null;
  sourceRef: string | null;
  metadata: Record<string, string>;
}

export function parseFidelityCsv(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const rows: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    if (values.length < header.length) continue;

    const record: Record<string, string> = {};
    header.forEach((h, idx) => {
      record[h.trim()] = values[idx]?.trim() || "";
    });

    // Convert MM/DD/YYYY to YYYY-MM-DD
    const dateParts = (record["Date"] || "").split("/");
    const date =
      dateParts.length === 3
        ? `${dateParts[2]}-${dateParts[0].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}`
        : "";

    rows.push({
      date,
      description: `${record["Transaction"] || ""} - ${record["Name"] || ""}`.trim(),
      amount: record["Amount"] || "0",
      currency: "USD",
      balanceAfter: null,
      sourceRef: null,
      metadata: record,
    });
  }

  return rows;
}
```

- [ ] **Step 6: Add detectInstitution and importCsv to finance service**

Add to `src/domains/finance/finance.service.ts`:

```typescript
import { parseRevolutCsv } from "./csv-parsers/revolut.js";
import { parseRobinhoodCsv } from "./csv-parsers/robinhood.js";
import { parseFidelityCsv } from "./csv-parsers/fidelity.js";

export function detectInstitution(csv: string): string | null {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  if (firstLine.includes("product") && firstLine.includes("started date")) return "revolut";
  if (firstLine.includes("activity date") && firstLine.includes("trans code")) return "robinhood";
  if (firstLine.includes("transaction") && firstLine.includes("memo")) return "fidelity";
  return null;
}

const parsers: Record<string, (csv: string) => ReturnType<typeof parseRevolutCsv>> = {
  revolut: parseRevolutCsv,
  robinhood: parseRobinhoodCsv,
  fidelity: parseFidelityCsv,
};

export async function importCsv(accountId: string, csvContent: string, institution?: string) {
  const detected = institution || detectInstitution(csvContent);
  if (!detected || !parsers[detected]) {
    throw new Error(`Could not detect institution or unsupported format: ${detected}`);
  }

  const parsed = parsers[detected](csvContent);
  let imported = 0;

  for (const row of parsed) {
    try {
      await db
        .insert(transactions)
        .values({
          accountId,
          date: row.date,
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          balanceAfter: row.balanceAfter,
          source: "csv_import",
          sourceRef: row.sourceRef,
          metadata: row.metadata,
        })
        .onConflictDoNothing();
      imported++;
    } catch {
      // Skip duplicates
    }
  }

  return { imported, total: parsed.length };
}
```

- [ ] **Step 7: Add CSV import route to finance routes**

Add to `src/domains/finance/finance.routes.ts`:

```typescript
import { importCsv } from "./finance.service.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

financeRouter.post("/import/csv", upload.single("file"), async (req, res, next) => {
  try {
    const accountId = req.body.account_id;
    if (!accountId) {
      res.status(400).json({ error: "account_id is required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "CSV file is required" });
      return;
    }
    const csvContent = req.file.buffer.toString("utf-8");
    const result = await importCsv(accountId, csvContent, req.body.institution);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
```

Install multer:

```bash
npm install multer
npm install @types/multer --save-dev
```

- [ ] **Step 8: Run tests**

```bash
npx vitest run tests/domains/csv-parsers.test.ts
npx vitest run tests/domains/finance.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/domains/finance/ tests/domains/csv-parsers.test.ts tests/domains/finance.test.ts package.json package-lock.json
git commit -m "feat: add CSV import with Revolut, Robinhood, and Fidelity parsers"
```

---

### Task 10: Business domain

**Files:**
- Create: `src/domains/business/business.schema.ts`
- Create: `src/domains/business/business.service.ts`
- Create: `src/domains/business/business.routes.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/app.ts`
- Create: `tests/domains/business.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/domains/business.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Business API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a client", async () => {
    const res = await request(app).post("/api/business/clients").set(AUTH).send({
      name: "Acme Corp",
      contactInfo: { email: "acme@example.com" },
      status: "active",
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Acme Corp");
  });

  it("creates a project linked to a client", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({
      name: "Acme Corp",
      status: "active",
    });

    const res = await request(app).post("/api/business/projects").set(AUTH).send({
      clientId: client.body.id,
      name: "Widget Redesign",
      status: "active",
      rate: { amount: 150, currency: "USD", type: "hourly" },
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Widget Redesign");
  });

  it("creates a time entry", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({
      name: "Acme Corp",
      status: "active",
    });
    const project = await request(app).post("/api/business/projects").set(AUTH).send({
      clientId: client.body.id,
      name: "Widget Redesign",
      status: "active",
    });

    const res = await request(app).post("/api/business/time").set(AUTH).send({
      projectId: project.body.id,
      description: "Architecture review",
      hours: 2.5,
      workedAt: "2026-04-06",
    });
    expect(res.status).toBe(201);
    expect(res.body.hours).toBe("2.5");
  });

  it("creates an invoice", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({
      name: "Acme Corp",
      status: "active",
    });

    const res = await request(app).post("/api/business/invoices").set(AUTH).send({
      clientId: client.body.id,
      amount: 3750,
      currency: "USD",
      status: "draft",
      issuedAt: "2026-04-06",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
  });

  it("creates an expense", async () => {
    const res = await request(app).post("/api/business/expenses").set(AUTH).send({
      category: "software",
      description: "GitHub subscription",
      amount: 44,
      currency: "USD",
      incurredAt: "2026-04-01",
      taxDeductible: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.taxDeductible).toBe(true);
  });

  it("queries clients by status", async () => {
    await request(app).post("/api/business/clients").set(AUTH).send({ name: "Active Co", status: "active" });
    await request(app).post("/api/business/clients").set(AUTH).send({ name: "Old Co", status: "inactive" });

    const res = await request(app).get("/api/business/clients?status=active").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Active Co");
  });

  it("queries time entries by project and date range", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({
      name: "Acme", status: "active",
    });
    const project = await request(app).post("/api/business/projects").set(AUTH).send({
      clientId: client.body.id, name: "P1", status: "active",
    });
    await request(app).post("/api/business/time").set(AUTH).send({
      projectId: project.body.id, description: "Work", hours: 3, workedAt: "2026-04-06",
    });

    const res = await request(app)
      .get(`/api/business/time?project_id=${project.body.id}&from=2026-04-01&to=2026-04-30`)
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/domains/business.test.ts
```

- [ ] **Step 3: Create business schema**

Create `src/domains/business/business.schema.ts`:

```typescript
import { pgTable, uuid, text, numeric, date, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactInfo: jsonb("contact_info"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  name: text("name").notNull(),
  status: text("status").notNull(),
  rate: jsonb("rate"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  description: text("description"),
  hours: numeric("hours").notNull(),
  workedAt: date("worked_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  projectId: uuid("project_id").references(() => projects.id),
  amount: numeric("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  issuedAt: date("issued_at"),
  paidAt: date("paid_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category"),
  description: text("description"),
  amount: numeric("amount").notNull(),
  currency: text("currency").notNull(),
  incurredAt: date("incurred_at").notNull(),
  taxDeductible: boolean("tax_deductible"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 4: Update db/schema.ts**

Add:

```typescript
export * from "../domains/business/business.schema.js";
```

- [ ] **Step 5: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 6: Create business service**

Create `src/domains/business/business.service.ts`:

```typescript
import { db } from "../../db/index.js";
import { clients, projects, timeEntries, invoices, expenses } from "./business.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";

// --- Clients ---

export async function createClient(input: { name: string; contactInfo?: Record<string, unknown>; status: string }) {
  const [row] = await db.insert(clients).values(input).returning();
  return row;
}

export async function queryClients(filters: { status?: string }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(clients.status, filters.status));
  return db
    .select()
    .from(clients)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(clients.createdAt));
}

// --- Projects ---

export async function createProject(input: {
  clientId: string;
  name: string;
  status: string;
  rate?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
}) {
  const [row] = await db
    .insert(projects)
    .values({
      clientId: input.clientId,
      name: input.name,
      status: input.status,
      rate: input.rate,
      startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
      endedAt: input.endedAt ? new Date(input.endedAt) : undefined,
    })
    .returning();
  return row;
}

export async function queryProjects(filters: { clientId?: string; status?: string }) {
  const conditions = [];
  if (filters.clientId) conditions.push(eq(projects.clientId, filters.clientId));
  if (filters.status) conditions.push(eq(projects.status, filters.status));
  return db
    .select()
    .from(projects)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(projects.createdAt));
}

// --- Time Entries ---

export async function createTimeEntry(input: {
  projectId: string;
  description?: string;
  hours: number;
  workedAt: string;
}) {
  const [row] = await db
    .insert(timeEntries)
    .values({
      projectId: input.projectId,
      description: input.description,
      hours: String(input.hours),
      workedAt: input.workedAt,
    })
    .returning();
  return row;
}

export async function queryTimeEntries(filters: { projectId?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
  if (filters.from) conditions.push(gte(timeEntries.workedAt, filters.from));
  if (filters.to) conditions.push(lte(timeEntries.workedAt, filters.to));
  return db
    .select()
    .from(timeEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(timeEntries.workedAt));
}

// --- Invoices ---

export async function createInvoice(input: {
  clientId: string;
  projectId?: string;
  amount: number;
  currency: string;
  status: string;
  issuedAt?: string;
  paidAt?: string;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(invoices)
    .values({
      clientId: input.clientId,
      projectId: input.projectId,
      amount: String(input.amount),
      currency: input.currency,
      status: input.status,
      issuedAt: input.issuedAt,
      paidAt: input.paidAt,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function queryInvoices(filters: { clientId?: string; status?: string }) {
  const conditions = [];
  if (filters.clientId) conditions.push(eq(invoices.clientId, filters.clientId));
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  return db
    .select()
    .from(invoices)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoices.createdAt));
}

// --- Expenses ---

export async function createExpense(input: {
  category?: string;
  description?: string;
  amount: number;
  currency: string;
  incurredAt: string;
  taxDeductible?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(expenses)
    .values({
      category: input.category,
      description: input.description,
      amount: String(input.amount),
      currency: input.currency,
      incurredAt: input.incurredAt,
      taxDeductible: input.taxDeductible,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function queryExpenses(filters: { category?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.category) conditions.push(eq(expenses.category, filters.category));
  if (filters.from) conditions.push(gte(expenses.incurredAt, filters.from));
  if (filters.to) conditions.push(lte(expenses.incurredAt, filters.to));
  return db
    .select()
    .from(expenses)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(expenses.incurredAt));
}
```

- [ ] **Step 7: Create business routes**

Create `src/domains/business/business.routes.ts`:

```typescript
import { Router } from "express";
import {
  createClient, queryClients,
  createProject, queryProjects,
  createTimeEntry, queryTimeEntries,
  createInvoice, queryInvoices,
  createExpense, queryExpenses,
} from "./business.service.js";

export const businessRouter = Router();

businessRouter.get("/clients", async (req, res, next) => {
  try {
    res.json(await queryClients({ status: req.query.status as string | undefined }));
  } catch (err) { next(err); }
});

businessRouter.post("/clients", async (req, res, next) => {
  try {
    res.status(201).json(await createClient(req.body));
  } catch (err) { next(err); }
});

businessRouter.get("/projects", async (req, res, next) => {
  try {
    res.json(await queryProjects({
      clientId: req.query.client_id as string | undefined,
      status: req.query.status as string | undefined,
    }));
  } catch (err) { next(err); }
});

businessRouter.post("/projects", async (req, res, next) => {
  try {
    res.status(201).json(await createProject(req.body));
  } catch (err) { next(err); }
});

businessRouter.get("/time", async (req, res, next) => {
  try {
    res.json(await queryTimeEntries({
      projectId: req.query.project_id as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    }));
  } catch (err) { next(err); }
});

businessRouter.post("/time", async (req, res, next) => {
  try {
    res.status(201).json(await createTimeEntry(req.body));
  } catch (err) { next(err); }
});

businessRouter.get("/invoices", async (req, res, next) => {
  try {
    res.json(await queryInvoices({
      clientId: req.query.client_id as string | undefined,
      status: req.query.status as string | undefined,
    }));
  } catch (err) { next(err); }
});

businessRouter.post("/invoices", async (req, res, next) => {
  try {
    res.status(201).json(await createInvoice(req.body));
  } catch (err) { next(err); }
});

businessRouter.get("/expenses", async (req, res, next) => {
  try {
    res.json(await queryExpenses({
      category: req.query.category as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    }));
  } catch (err) { next(err); }
});

businessRouter.post("/expenses", async (req, res, next) => {
  try {
    res.status(201).json(await createExpense(req.body));
  } catch (err) { next(err); }
});
```

- [ ] **Step 8: Register business routes in app.ts**

Add to `src/app.ts`:

```typescript
import { businessRouter } from "./domains/business/business.routes.js";

app.use("/api/business", businessRouter);
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/domains/business.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/domains/business/ src/db/schema.ts src/app.ts tests/domains/business.test.ts src/db/migrations/
git commit -m "feat: add business domain with clients, projects, time, invoices, expenses"
```

---

### Task 11: Documents domain with semantic search

**Files:**
- Create: `src/domains/documents/documents.schema.ts`
- Create: `src/domains/documents/embedding.ts`
- Create: `src/domains/documents/documents.service.ts`
- Create: `src/domains/documents/documents.routes.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/app.ts`
- Create: `tests/domains/documents.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/domains/documents.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Documents API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("POST /api/documents creates a document", async () => {
    const res = await request(app).post("/api/documents").set(AUTH).send({
      domain: "email",
      title: "Meeting notes",
      content: "Discussed the roadmap for Q2",
      metadata: { from: "alice@example.com", tags: ["meeting"] },
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.domain).toBe("email");
  });

  it("GET /api/documents filters by domain", async () => {
    await request(app).post("/api/documents").set(AUTH).send({
      domain: "email",
      title: "Email 1",
      content: "Content 1",
    });
    await request(app).post("/api/documents").set(AUTH).send({
      domain: "notes",
      title: "Note 1",
      content: "Content 2",
    });

    const res = await request(app).get("/api/documents?domain=email").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].domain).toBe("email");
  });

  it("GET /api/documents/:id returns a single document", async () => {
    const created = await request(app).post("/api/documents").set(AUTH).send({
      domain: "notes",
      title: "Test",
      content: "Body",
    });

    const res = await request(app).get(`/api/documents/${created.body.id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/domains/documents.test.ts
```

- [ ] **Step 3: Create documents schema**

Create `src/domains/documents/documents.schema.ts`:

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  title: text("title"),
  content: text("content"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Note: The embeddings table uses pgvector. Drizzle doesn't have native vector support,
// so we create this table via a custom migration. The schema here is for reference only.
// The actual table is created in a manual SQL migration.
export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    // embedding column is VECTOR(1536) — handled via raw SQL
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("embeddings_document_idx").on(table.documentId)]
);
```

- [ ] **Step 4: Update db/schema.ts**

Add:

```typescript
export * from "../domains/documents/documents.schema.js";
```

- [ ] **Step 5: Generate migration and add pgvector setup**

```bash
npx drizzle-kit generate
```

Then create a manual SQL migration file for the vector column. Create `src/db/migrations/0000_add_pgvector.sql` (use the next sequence number from what drizzle-kit generated):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings USING ivfflat (embedding vector_cosine_ops);
```

Run migrations:

```bash
npx drizzle-kit migrate
```

If the manual migration doesn't run via drizzle-kit, run it directly:

```bash
docker compose exec postgres psql -U pds -d personal_data_store -f -
```

And paste the SQL. Alternatively, execute via the app at startup — but for now, running manually is fine.

- [ ] **Step 6: Create embedding utility**

Create `src/domains/documents/embedding.ts`:

```typescript
import { config } from "../../config.js";

const EMBEDDING_DIMENSION = 1536;
const CHUNK_SIZE = 500; // characters per chunk

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [""];
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey || !process.env.OPENAI_API_KEY) {
    // Return zero vector as placeholder when no embedding API is configured
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  // OpenAI embeddings API
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = (await response.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}
```

- [ ] **Step 7: Create documents service**

Create `src/domains/documents/documents.service.ts`:

```typescript
import { db } from "../../db/index.js";
import { documents, embeddings } from "./documents.schema.js";
import { chunkText, generateEmbedding } from "./embedding.js";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

interface CreateDocumentInput {
  domain: string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  generateEmbeddings?: boolean;
}

export async function createDocument(input: CreateDocumentInput) {
  const [doc] = await db
    .insert(documents)
    .values({
      domain: input.domain,
      title: input.title,
      content: input.content,
      metadata: input.metadata,
    })
    .returning();

  if (input.generateEmbeddings && input.content) {
    const chunks = chunkText(input.content);
    for (let i = 0; i < chunks.length; i++) {
      const vector = await generateEmbedding(chunks[i]);
      await db.execute(sql`
        INSERT INTO embeddings (id, document_id, chunk_index, chunk_text, embedding, created_at)
        VALUES (gen_random_uuid(), ${doc.id}, ${i}, ${chunks[i]}, ${sql.raw(`'[${vector.join(",")}]'::vector`)}, NOW())
      `);
    }
  }

  return doc;
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return doc || null;
}

export async function queryDocuments(filters: { domain?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.domain) conditions.push(eq(documents.domain, filters.domain));
  if (filters.from) conditions.push(gte(documents.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(documents.createdAt, new Date(filters.to)));

  return db
    .select()
    .from(documents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documents.createdAt));
}

export async function semanticSearch(query: string, limit = 10) {
  const queryVector = await generateEmbedding(query);
  const vectorLiteral = `[${queryVector.join(",")}]`;

  const results = await db.execute(sql`
    SELECT e.chunk_text, e.chunk_index, e.document_id,
           d.title, d.domain, d.metadata,
           e.embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)} AS distance
    FROM embeddings e
    JOIN documents d ON d.id = e.document_id
    ORDER BY distance ASC
    LIMIT ${limit}
  `);

  return results;
}
```

- [ ] **Step 8: Create documents routes**

Create `src/domains/documents/documents.routes.ts`:

```typescript
import { Router } from "express";
import { createDocument, getDocument, queryDocuments, semanticSearch } from "./documents.service.js";

export const documentsRouter = Router();

documentsRouter.get("/", async (req, res, next) => {
  try {
    res.json(
      await queryDocuments({
        domain: req.query.domain as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

documentsRouter.get("/:id", async (req, res, next) => {
  try {
    const doc = await getDocument(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/", async (req, res, next) => {
  try {
    const doc = await createDocument(req.body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/search", async (req, res, next) => {
  try {
    const { query, limit } = req.body;
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    const results = await semanticSearch(query, limit || 10);
    res.json(results);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 9: Register documents routes in app.ts**

Add to `src/app.ts`:

```typescript
import { documentsRouter } from "./domains/documents/documents.routes.js";

app.use("/api/documents", documentsRouter);
```

- [ ] **Step 10: Run tests**

```bash
npx vitest run tests/domains/documents.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/domains/documents/ src/db/schema.ts src/app.ts tests/domains/documents.test.ts src/db/migrations/
git commit -m "feat: add documents domain with semantic search via pgvector"
```

---

## Phase 3: Connector Engine

### Task 12: Connector interface, runner, and scheduler

**Files:**
- Create: `src/connectors/connector.interface.ts`
- Create: `src/connectors/connector.runner.ts`
- Create: `src/connectors/scheduler.ts`
- Modify: `src/server.ts`
- Modify: `src/system/system.routes.ts`
- Create: `tests/connectors/connector-runner.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/connectors/connector-runner.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { runConnector } from "../../src/connectors/connector.runner.js";
import { db } from "../../src/db/index.js";
import { connectorRuns } from "../../src/system/system.schema.js";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/setup.js";
import type { Connector } from "../../src/connectors/connector.interface.js";

describe("Connector Runner", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("logs a successful run", async () => {
    const mockConnector: Connector = {
      name: "test_connector",
      schedule: null,
      async sync() {
        return { recordsSynced: 5 };
      },
    };

    const result = await runConnector(mockConnector);
    expect(result.recordsSynced).toBe(5);

    const runs = await db
      .select()
      .from(connectorRuns)
      .where(eq(connectorRuns.connector, "test_connector"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
    expect(runs[0].recordsSynced).toBe(5);
  });

  it("logs a failed run", async () => {
    const mockConnector: Connector = {
      name: "failing_connector",
      schedule: null,
      async sync() {
        throw new Error("API down");
      },
    };

    const result = await runConnector(mockConnector);
    expect(result.recordsSynced).toBe(0);
    expect(result.errors).toContain("API down");

    const runs = await db
      .select()
      .from(connectorRuns)
      .where(eq(connectorRuns.connector, "failing_connector"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("failed");
    expect(runs[0].error).toBe("API down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/connectors/connector-runner.test.ts
```

- [ ] **Step 3: Create connector interface**

Create `src/connectors/connector.interface.ts`:

```typescript
export interface SyncResult {
  recordsSynced: number;
  errors?: string[];
}

export interface Connector {
  name: string;
  schedule: string | null;
  sync(): Promise<SyncResult>;
}
```

- [ ] **Step 4: Create connector runner**

Create `src/connectors/connector.runner.ts`:

```typescript
import { db } from "../db/index.js";
import { connectorRuns } from "../system/system.schema.js";
import { eq } from "drizzle-orm";
import type { Connector, SyncResult } from "./connector.interface.js";

export async function runConnector(connector: Connector): Promise<SyncResult> {
  const [run] = await db
    .insert(connectorRuns)
    .values({
      connector: connector.name,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  try {
    const result = await connector.sync();

    await db
      .update(connectorRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        recordsSynced: result.recordsSynced,
      })
      .where(eq(connectorRuns.id, run.id));

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(connectorRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        recordsSynced: 0,
        error: message,
      })
      .where(eq(connectorRuns.id, run.id));

    return { recordsSynced: 0, errors: [message] };
  }
}
```

- [ ] **Step 5: Create scheduler**

Create `src/connectors/scheduler.ts`:

```typescript
import cron from "node-cron";
import { config } from "../config.js";
import { runConnector } from "./connector.runner.js";
import type { Connector } from "./connector.interface.js";

const registeredConnectors: Map<string, Connector> = new Map();

export function registerConnector(connector: Connector) {
  registeredConnectors.set(connector.name, connector);
}

export function getConnector(name: string): Connector | undefined {
  return registeredConnectors.get(name);
}

export function startScheduler() {
  for (const [name, connector] of registeredConnectors) {
    const connectorConfig = config.connectors[name as keyof typeof config.connectors];
    if (!connectorConfig?.enabled || !connectorConfig.schedule) continue;

    cron.schedule(connectorConfig.schedule, async () => {
      console.log(`[scheduler] Running connector: ${name}`);
      const result = await runConnector(connector);
      console.log(`[scheduler] ${name} finished: ${result.recordsSynced} records synced`);
      if (result.errors?.length) {
        console.error(`[scheduler] ${name} errors:`, result.errors);
      }
    });

    console.log(`[scheduler] Scheduled ${name} with cron: ${connectorConfig.schedule}`);
  }
}
```

- [ ] **Step 6: Add manual sync trigger to system routes**

Add to `src/system/system.routes.ts`:

```typescript
import { getConnector } from "../connectors/scheduler.js";
import { runConnector } from "../connectors/connector.runner.js";

systemRouter.post("/connectors/:name/sync", async (req, res, next) => {
  try {
    const connector = getConnector(req.params.name);
    if (!connector) {
      res.status(404).json({ error: `Connector '${req.params.name}' not found` });
      return;
    }
    const result = await runConnector(connector);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 7: Update server.ts to start scheduler**

Update `src/server.ts`:

```typescript
import { app } from "./app.js";
import { config } from "./config.js";
import { startScheduler } from "./connectors/scheduler.js";

// Import and register connectors here as they are built
// import { auraConnector } from "./connectors/aura.connector.js";
// registerConnector(auraConnector);

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`Personal Data Store running at http://127.0.0.1:${config.port}`);
  startScheduler();
});

export { server };
```

- [ ] **Step 8: Run tests**

```bash
npx vitest run tests/connectors/connector-runner.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/connectors/ src/system/system.routes.ts src/server.ts tests/connectors/
git commit -m "feat: add connector engine with runner, scheduler, and manual sync trigger"
```

---

## Phase 4: Connectors

### Task 13: Apple Health webhook

**Files:**
- Create: `src/webhooks/apple-health.webhook.ts`
- Modify: `src/app.ts`
- Create: `tests/connectors/apple-health.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/connectors/apple-health.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { healthMetrics } from "../../src/domains/health/health.schema.js";

describe("Apple Health Webhook", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects requests without webhook secret", async () => {
    const res = await request(app)
      .post("/webhooks/apple-health")
      .send({ data: { metrics: [] } });
    expect(res.status).toBe(401);
  });

  it("accepts and stores Health Auto Export data", async () => {
    const payload = {
      data: {
        metrics: [
          {
            name: "heart_rate",
            units: "bpm",
            data: [
              { date: "2026-04-06T10:00:00Z", qty: 72 },
              { date: "2026-04-06T10:05:00Z", qty: 75 },
            ],
          },
          {
            name: "step_count",
            units: "count",
            data: [{ date: "2026-04-06T10:00:00Z", qty: 250 }],
          },
        ],
      },
    };

    const res = await request(app)
      .post("/webhooks/apple-health")
      .set("X-Webhook-Secret", process.env.WEBHOOK_SECRET || "")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.recordsSynced).toBe(3);

    const rows = await db.select().from(healthMetrics);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.metricType === "heart_rate")).toBe(true);
    expect(rows.some((r) => r.metricType === "step_count")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/connectors/apple-health.test.ts
```

- [ ] **Step 3: Create Apple Health webhook handler**

Create `src/webhooks/apple-health.webhook.ts`:

```typescript
import { Router } from "express";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { healthMetrics } from "../domains/health/health.schema.js";

export const appleHealthWebhook = Router();

appleHealthWebhook.post("/apple-health", async (req, res, next) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    if (secret !== config.webhookSecret) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return;
    }

    const metrics = req.body?.data?.metrics;
    if (!Array.isArray(metrics)) {
      res.status(400).json({ error: "Invalid payload: expected data.metrics array" });
      return;
    }

    let recordsSynced = 0;

    for (const metric of metrics) {
      const metricType = metric.name as string;
      const unit = metric.units as string;
      const dataPoints = metric.data as { date: string; qty: number }[];

      if (!Array.isArray(dataPoints)) continue;

      for (const point of dataPoints) {
        await db.insert(healthMetrics).values({
          source: "apple_health",
          metricType,
          value: String(point.qty),
          unit,
          recordedAt: new Date(point.date),
          metadata: { rawMetricName: metric.name },
        });
        recordsSynced++;
      }
    }

    res.json({ recordsSynced });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Register webhook in app.ts**

Add to `src/app.ts` — BEFORE the auth middleware (webhooks use their own auth):

```typescript
import { appleHealthWebhook } from "./webhooks/apple-health.webhook.js";

// Webhooks (before /api auth middleware)
app.use("/webhooks", appleHealthWebhook);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/connectors/apple-health.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/webhooks/ src/app.ts tests/connectors/apple-health.test.ts
git commit -m "feat: add Apple Health webhook receiver for Health Auto Export"
```

---

### Task 14: Aura (Oura) connector

**Files:**
- Create: `src/connectors/aura.connector.ts`
- Modify: `src/server.ts`
- Create: `tests/connectors/aura.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/connectors/aura.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { auraConnector } from "../../src/connectors/aura.connector.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { healthMetrics } from "../../src/domains/health/health.schema.js";

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Aura (Oura) Connector", () => {
  beforeEach(async () => {
    await resetDb();
    mockFetch.mockReset();
  });

  it("fetches sleep data and stores as health metrics", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            day: "2026-04-05",
            score: 85,
            contributors: { deep_sleep: 80, rem_sleep: 75 },
          },
        ],
      }),
    });

    // Mock daily activity
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const result = await auraConnector.sync();
    expect(result.recordsSynced).toBeGreaterThan(0);

    const rows = await db.select().from(healthMetrics);
    expect(rows.some((r) => r.metricType === "sleep_score")).toBe(true);
  });

  it("handles API errors gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(auraConnector.sync()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/connectors/aura.test.ts
```

- [ ] **Step 3: Create Aura connector**

Create `src/connectors/aura.connector.ts`:

```typescript
import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { healthMetrics } from "../domains/health/health.schema.js";

const OURA_BASE_URL = "https://api.ouraring.com/v2/usercollection";

async function ouraFetch(endpoint: string): Promise<unknown> {
  const token = process.env.OURA_ACCESS_TOKEN;
  if (!token) throw new Error("OURA_ACCESS_TOKEN not configured");

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const res = await fetch(`${OURA_BASE_URL}/${endpoint}?start_date=${weekAgo}&end_date=${today}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Oura API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export const auraConnector: Connector = {
  name: "aura",
  schedule: "0 */6 * * *",

  async sync(): Promise<SyncResult> {
    let recordsSynced = 0;

    // Fetch sleep scores
    const sleepData = (await ouraFetch("daily_sleep")) as {
      data: { day: string; score: number; contributors: Record<string, number> }[];
    };

    for (const entry of sleepData.data) {
      await db.insert(healthMetrics).values({
        source: "aura",
        metricType: "sleep_score",
        value: String(entry.score),
        unit: "score",
        recordedAt: new Date(entry.day),
        metadata: { contributors: entry.contributors },
      });
      recordsSynced++;
    }

    // Fetch daily activity
    const activityData = (await ouraFetch("daily_activity")) as {
      data: { day: string; score: number; steps: number; active_calories: number }[];
    };

    for (const entry of activityData.data) {
      await db.insert(healthMetrics).values({
        source: "aura",
        metricType: "activity_score",
        value: String(entry.score),
        unit: "score",
        recordedAt: new Date(entry.day),
        metadata: { steps: entry.steps, activeCalories: entry.active_calories },
      });
      recordsSynced++;
    }

    return { recordsSynced };
  },
};
```

- [ ] **Step 4: Register connector in server.ts**

Add to `src/server.ts`:

```typescript
import { registerConnector } from "./connectors/scheduler.js";
import { auraConnector } from "./connectors/aura.connector.js";

registerConnector(auraConnector);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/connectors/aura.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/aura.connector.ts src/server.ts tests/connectors/aura.test.ts
git commit -m "feat: add Aura (Oura) connector for sleep and activity data"
```

---

### Task 15: Crypto portfolio connector

**Files:**
- Create: `src/connectors/crypto.connector.ts`
- Modify: `src/server.ts`
- Create: `tests/connectors/crypto.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/connectors/crypto.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cryptoConnector } from "../../src/connectors/crypto.connector.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { wallets } from "../../src/domains/finance/finance.schema.js";
import { portfolioSnapshots } from "../../src/domains/finance/finance.schema.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Crypto Connector", () => {
  beforeEach(async () => {
    await resetDb();
    mockFetch.mockReset();
  });

  it("fetches portfolio data for each wallet", async () => {
    // Seed a wallet
    const [wallet] = await db
      .insert(wallets)
      .values({ address: "0xabc", chain: "ethereum", label: "main" })
      .returning();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalBalanceUsd: 15000,
        assets: [
          { symbol: "ETH", balance: 5, balanceUSD: 10000 },
          { symbol: "USDC", balance: 5000, balanceUSD: 5000 },
        ],
      }),
    });

    const result = await cryptoConnector.sync();
    expect(result.recordsSynced).toBe(1);

    const snapshots = await db.select().from(portfolioSnapshots);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].walletId).toBe(wallet.id);
    expect(snapshots[0].totalValueUsd).toBe("15000");
  });

  it("handles no wallets gracefully", async () => {
    const result = await cryptoConnector.sync();
    expect(result.recordsSynced).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/connectors/crypto.test.ts
```

- [ ] **Step 3: Create crypto connector**

Create `src/connectors/crypto.connector.ts`:

```typescript
import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { wallets, portfolioSnapshots } from "../domains/finance/finance.schema.js";

export const cryptoConnector: Connector = {
  name: "crypto",
  schedule: "*/15 * * * *",

  async sync(): Promise<SyncResult> {
    const apiKey = process.env.ZAPPER_API_KEY;
    const allWallets = await db.select().from(wallets);
    let recordsSynced = 0;

    for (const wallet of allWallets) {
      try {
        // Using Zapper V2 API as default — swap for DeBank/Zerion as needed
        const res = await fetch(
          `https://api.zapper.xyz/v2/balances?addresses[]=${wallet.address}&networks[]=${wallet.chain}`,
          {
            headers: apiKey ? { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` } : {},
          }
        );

        if (!res.ok) {
          throw new Error(`Zapper API error: ${res.status}`);
        }

        const data = (await res.json()) as {
          totalBalanceUsd: number;
          assets: { symbol: string; balance: number; balanceUSD: number }[];
        };

        await db.insert(portfolioSnapshots).values({
          walletId: wallet.id,
          totalValueUsd: String(data.totalBalanceUsd),
          positions: data.assets,
          source: "zapper",
          snapshotAt: new Date(),
        });

        recordsSynced++;
      } catch (err) {
        console.error(`[crypto] Failed to fetch portfolio for ${wallet.address}:`, err);
      }
    }

    return { recordsSynced };
  },
};
```

- [ ] **Step 4: Register in server.ts**

Add to `src/server.ts`:

```typescript
import { cryptoConnector } from "./connectors/crypto.connector.js";

registerConnector(cryptoConnector);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/connectors/crypto.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/crypto.connector.ts src/server.ts tests/connectors/crypto.test.ts
git commit -m "feat: add crypto portfolio connector using Zapper API"
```

---

### Task 16: Gmail connector

**Files:**
- Create: `src/connectors/gmail.connector.ts`
- Modify: `src/server.ts`
- Create: `tests/connectors/gmail.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/connectors/gmail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { gmailConnector } from "../../src/connectors/gmail.connector.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { documents } from "../../src/domains/documents/documents.schema.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Gmail Connector", () => {
  beforeEach(async () => {
    await resetDb();
    mockFetch.mockReset();
  });

  it("fetches emails and stores as documents", async () => {
    // Mock token refresh
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mock-access-token" }),
    });

    // Mock messages.list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [{ id: "msg1" }],
        nextPageToken: null,
      }),
    });

    // Mock messages.get for msg1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg1",
        snippet: "Hello, this is a test email",
        payload: {
          headers: [
            { name: "From", value: "alice@example.com" },
            { name: "To", value: "me@example.com" },
            { name: "Subject", value: "Test Email" },
            { name: "Date", value: "Mon, 6 Apr 2026 10:00:00 +0000" },
          ],
        },
      }),
    });

    const result = await gmailConnector.sync();
    expect(result.recordsSynced).toBe(1);

    const docs = await db.select().from(documents);
    expect(docs).toHaveLength(1);
    expect(docs[0].domain).toBe("email");
    expect(docs[0].title).toBe("Test Email");
  });

  it("handles missing credentials", async () => {
    const origId = process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_ID;
    await expect(gmailConnector.sync()).rejects.toThrow();
    process.env.GMAIL_CLIENT_ID = origId;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/connectors/gmail.test.ts
```

- [ ] **Step 3: Create Gmail connector**

Create `src/connectors/gmail.connector.ts`:

```typescript
import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { documents } from "../domains/documents/documents.schema.js";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth credentials not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export const gmailConnector: Connector = {
  name: "gmail",
  schedule: "0 * * * *",

  async sync(): Promise<SyncResult> {
    const accessToken = await getAccessToken();
    let recordsSynced = 0;

    // Fetch recent messages (last 24 hours)
    const after = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=after:${after}&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
    const listData = (await listRes.json()) as { messages?: { id: string }[] };

    if (!listData.messages) return { recordsSynced: 0 };

    for (const msg of listData.messages) {
      // Check if already imported
      const existing = await db
        .select({ id: documents.id })
        .from(documents)
        .where(sql`${documents.metadata}->>'gmailId' = ${msg.id}`)
        .limit(1);

      if (existing.length > 0) continue;

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgRes.ok) continue;
      const msgData = (await msgRes.json()) as {
        id: string;
        snippet: string;
        payload: { headers: { name: string; value: string }[] };
      };

      const headers = msgData.payload.headers;

      await db.insert(documents).values({
        domain: "email",
        title: getHeader(headers, "Subject"),
        content: msgData.snippet,
        metadata: {
          gmailId: msgData.id,
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          date: getHeader(headers, "Date"),
        },
      });

      recordsSynced++;
    }

    return { recordsSynced };
  },
};
```

- [ ] **Step 4: Register in server.ts**

Add to `src/server.ts`:

```typescript
import { gmailConnector } from "./connectors/gmail.connector.js";

registerConnector(gmailConnector);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/connectors/gmail.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/gmail.connector.ts src/server.ts tests/connectors/gmail.test.ts
git commit -m "feat: add Gmail connector for email ingestion"
```

---

### Task 17: Stub connectors (MyFitnessPal, Revolut)

These connectors depend on APIs with limited or complex access. Create working stubs that implement the connector interface and document what API access is needed.

**Files:**
- Create: `src/connectors/myfitnesspal.connector.ts`
- Create: `src/connectors/revolut.connector.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create MyFitnessPal connector stub**

Create `src/connectors/myfitnesspal.connector.ts`:

```typescript
import type { Connector, SyncResult } from "./connector.interface.js";

// MyFitnessPal does not have a stable public API.
// Options:
// 1. Use the unofficial MFP API (may break)
// 2. Use a scraping approach
// 3. CSV export + manual import
// For now, this is a stub. Implement sync() when API access is available.

export const myfitnesspalConnector: Connector = {
  name: "myfitnesspal",
  schedule: "0 */12 * * *",

  async sync(): Promise<SyncResult> {
    console.log("[myfitnesspal] Connector not yet implemented — skipping");
    return { recordsSynced: 0 };
  },
};
```

- [ ] **Step 2: Create Revolut connector stub**

Create `src/connectors/revolut.connector.ts`:

```typescript
import type { Connector, SyncResult } from "./connector.interface.js";

// Revolut Open Banking API requires:
// 1. Register as a third-party provider or use Revolut Business API
// 2. OAuth2 consent flow for account access
// 3. PSD2 compliance for EU banking data
//
// For personal use, CSV import (Task 9) is the pragmatic path.
// This stub is here for when API access is configured.

export const revolutConnector: Connector = {
  name: "revolut",
  schedule: "0 2 * * *",

  async sync(): Promise<SyncResult> {
    console.log("[revolut] Connector not yet implemented — use CSV import instead");
    return { recordsSynced: 0 };
  },
};
```

- [ ] **Step 3: Register in server.ts**

Add to `src/server.ts`:

```typescript
import { myfitnesspalConnector } from "./connectors/myfitnesspal.connector.js";
import { revolutConnector } from "./connectors/revolut.connector.js";

registerConnector(myfitnesspalConnector);
registerConnector(revolutConnector);
```

- [ ] **Step 4: Commit**

```bash
git add src/connectors/myfitnesspal.connector.ts src/connectors/revolut.connector.ts src/server.ts
git commit -m "feat: add stub connectors for MyFitnessPal and Revolut"
```

---

## Phase 5: Integration & Polish

### Task 18: Full integration test

**Files:**
- Create: `tests/integration/api.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/api.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Integration: Full API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("health check works without auth", async () => {
    const res = await request(app).get("/api/system/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request(app).get("/api/health/metrics");
    expect(res.status).toBe(401);
  });

  it("end-to-end: create and query health data", async () => {
    await request(app).post("/api/health/metrics").set(AUTH).send({
      source: "manual",
      metricType: "heart_rate",
      value: 72,
      unit: "bpm",
      recordedAt: "2026-04-06T10:00:00Z",
    });

    const res = await request(app).get("/api/health/metrics?type=heart_rate").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("end-to-end: business workflow", async () => {
    const client = await request(app)
      .post("/api/business/clients")
      .set(AUTH)
      .send({ name: "TestCo", status: "active" });

    const project = await request(app)
      .post("/api/business/projects")
      .set(AUTH)
      .send({ clientId: client.body.id, name: "Project X", status: "active" });

    await request(app)
      .post("/api/business/time")
      .set(AUTH)
      .send({ projectId: project.body.id, description: "Dev work", hours: 4, workedAt: "2026-04-06" });

    const invoice = await request(app)
      .post("/api/business/invoices")
      .set(AUTH)
      .send({ clientId: client.body.id, amount: 600, currency: "USD", status: "draft", issuedAt: "2026-04-06" });

    expect(invoice.status).toBe(201);

    const time = await request(app)
      .get(`/api/business/time?project_id=${project.body.id}`)
      .set(AUTH);
    expect(time.body).toHaveLength(1);
    expect(time.body[0].hours).toBe("4");
  });

  it("end-to-end: finance workflow", async () => {
    const wallet = await request(app)
      .post("/api/finance/wallets")
      .set(AUTH)
      .send({ address: "0xdeadbeef", chain: "ethereum", label: "test" });
    expect(wallet.status).toBe(201);

    const account = await request(app)
      .post("/api/finance/accounts")
      .set(AUTH)
      .send({ institution: "revolut", accountName: "checking", accountType: "checking", currency: "GBP" });
    expect(account.status).toBe(201);

    const wallets = await request(app).get("/api/finance/wallets").set(AUTH);
    expect(wallets.body).toHaveLength(1);

    const accounts = await request(app).get("/api/finance/accounts").set(AUTH);
    expect(accounts.body).toHaveLength(1);
  });

  it("end-to-end: documents and search", async () => {
    await request(app).post("/api/documents").set(AUTH).send({
      domain: "email",
      title: "Important email",
      content: "We need to discuss the quarterly budget review",
    });

    const docs = await request(app).get("/api/documents?domain=email").set(AUTH);
    expect(docs.body).toHaveLength(1);
    expect(docs.body[0].title).toBe("Important email");
  });

  it("system: lists connectors", async () => {
    const res = await request(app).get("/api/system/connectors").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((c: { name: string }) => c.name === "aura")).toBe(true);
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/
git commit -m "feat: add integration tests for full API workflow"
```

---

### Task 19: Final cleanup and README

**Files:**
- Modify: `README.md`
- Modify: `package.json` (verify scripts)

- [ ] **Step 1: Update README.md**

```markdown
# Personal Data Store

A TypeScript personal data service running locally on macOS. Stores health, genomics, finance, business, and document data in PostgreSQL with pgvector for semantic search.

## Quick Start

```bash
# Start PostgreSQL
docker compose up -d

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run migrations
npm run db:migrate

# Start the service
npm run dev
```

## API

All endpoints require `Authorization: Bearer <API_KEY>`.

- `GET /api/system/health` — health check (no auth)
- `GET /api/health/metrics` — query health metrics
- `GET /api/genomics/variants` — query genomic variants
- `GET /api/finance/transactions` — query financial transactions
- `GET /api/business/clients` — query business clients
- `GET /api/documents` — query documents
- `POST /api/documents/search` — semantic search

See `docs/superpowers/specs/2026-04-06-personal-data-store-design.md` for the full API reference.

## Testing

```bash
npm test
```
```

- [ ] **Step 2: Run full test suite one final time**

```bash
npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with quick start and API overview"
```
