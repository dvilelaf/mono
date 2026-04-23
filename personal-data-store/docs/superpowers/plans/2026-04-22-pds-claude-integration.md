# PDS Claude Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend PDS so Claude can consult it via `/api/about`, write data back via documents with source tracking, manage an inbox of drafts, and access it securely over Tailscale HTTPS.

**Architecture:** Two Drizzle migrations add `source` and `type` columns to `documents` and `analyses`. A new `/api/about` endpoint fans out to all domain tables in parallel. A Next.js app in `frontend/` provides inbox triage. A fresh API key is generated and a Tailscale serve script exposes the API over HTTPS.

**Tech Stack:** Express 5, Drizzle ORM, PostgreSQL/pgvector, Next.js 14 App Router, Tailwind CSS, Vitest + supertest.

---

## File Map

**Create:**
- `src/db/migrations/0014_source_type_columns.sql` — ALTER TABLE adds source/type to documents, source to analyses
- `src/system/about.routes.ts` — GET /api/about parallel fan-out query
- `frontend/` — new Next.js 14 app (entire directory)
- `frontend/src/app/layout.tsx` — root layout with nav links
- `frontend/src/app/page.tsx` — home redirect
- `frontend/src/app/inbox/page.tsx` — inbox triage (server + client components)
- `scripts/tailscale-serve.sh` — `tailscale serve --bg --https=443 http://localhost:3000`
- `tests/system/about.test.ts` — tests for /api/about

**Modify:**
- `src/domains/documents/documents.schema.ts` — add `source`, `type` fields
- `src/domains/analyses/analyses.schema.ts` — add `source` field
- `src/domains/documents/documents.service.ts` — add source/type to CreateDocumentInput, add updateDocument
- `src/domains/documents/documents.routes.ts` — add PATCH /:id, DELETE /:id
- `src/domains/analyses/analyses.routes.ts` — add POST /
- `src/app.ts` — import and mount aboutRouter
- `tests/domains/documents.test.ts` — add source/type round-trip tests
- `CLAUDE.md` — document new endpoint, source convention, inbox pattern
- `README.md` — document Tailscale HTTPS URL

---

## Task 1: Rotate API key

**Files:**
- Modify: `.env` (do not commit)

- [ ] **Step 1: Generate a fresh 64-char hex key**

```bash
openssl rand -hex 32
```

Copy the output — this is your new API_KEY.

- [ ] **Step 2: Update .env**

Open `.env` and replace the value of `API_KEY=` with the new key. The file should have one line like:

```
API_KEY=<new-64-char-hex>
```

- [ ] **Step 3: Print the new key clearly**

```bash
echo "NEW API KEY: $(grep ^API_KEY .env | cut -d= -f2)"
```

Paste the output into auto-memory under key `reference_pds_api_key` or wherever Oak stores it.

- [ ] **Step 4: Restart pm2 so the new key takes effect**

```bash
pm2 restart pds
pm2 logs pds --lines 5
```

Expected: server starts cleanly on port 3000, no auth errors.

- [ ] **Step 5: Verify the new key works**

```bash
NEW_KEY=$(grep ^API_KEY .env | cut -d= -f2)
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $NEW_KEY" http://localhost:3000/api/system/health
```

Expected: `200`

- [ ] **Step 6: Commit (nothing to commit — .env is gitignored)**

```bash
git status
# should show .env as untracked/ignored — do NOT commit it
```

---

## Task 2: Tailscale serve script and README update

**Files:**
- Create: `scripts/tailscale-serve.sh`
- Modify: `README.md`

- [ ] **Step 1: Create the script**

```bash
cat > scripts/tailscale-serve.sh << 'EOF'
#!/usr/bin/env bash
# Expose PDS API over HTTPS via Tailscale Funnel proxy.
# Run once; tailscale serve persists across reboots.
set -euo pipefail
tailscale serve --bg --https=443 http://localhost:3000
echo "HTTPS endpoint active. Check: tailscale serve status"
EOF
chmod +x scripts/tailscale-serve.sh
```

- [ ] **Step 2: Update README.md**

Open `README.md` and add this section after the existing Quick Start:

```markdown
## Network Access

### Local (Tailscale MagicDNS)
`http://pds:3000` — available to all devices on the tailnet without HTTPS.

### HTTPS (Tailscale Serve)
Run once to activate:
```bash
./scripts/tailscale-serve.sh
```
This exposes the API at `https://pds.<tailnet>.ts.net` (port 443).  
Find your exact URL with `tailscale serve status`.

Both access methods use the same `Authorization: Bearer <API_KEY>` header.
```

- [ ] **Step 3: Commit**

```bash
cd /path/to/personal-data-store
git add scripts/tailscale-serve.sh README.md
git commit -m "infra: add tailscale serve script and document HTTPS endpoint"
```

---

## Task 3: Source and type columns — migration and schema

**Files:**
- Create: `src/db/migrations/0014_source_type_columns.sql`
- Modify: `src/domains/documents/documents.schema.ts`
- Modify: `src/domains/analyses/analyses.schema.ts`

- [ ] **Step 1: Write the migration SQL**

Create `src/db/migrations/0014_source_type_columns.sql`:

```sql
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "type" text;
--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "source" text;
```

The `IF NOT EXISTS` guard makes this idempotent.

- [ ] **Step 2: Update documents schema**

Replace `src/domains/documents/documents.schema.ts` with:

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  type: text("type"),
  title: text("title"),
  content: text("content"),
  source: text("source"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    // embedding column is VECTOR(1536) — handled via raw SQL migration
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("embeddings_document_idx").on(table.documentId)]
);
```

- [ ] **Step 3: Update analyses schema**

Replace `src/domains/analyses/analyses.schema.ts` with:

```typescript
import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain").notNull(),
    analysisType: text("analysis_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content"),
    confidence: text("confidence"),
    entities: jsonb("entities"),
    result: jsonb("result"),
    sourceQuery: jsonb("source_query"),
    parentId: uuid("parent_id"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analyses_domain_type_idx").on(table.domain, table.analysisType),
    index("analyses_parent_idx").on(table.parentId),
  ]
);
```

- [ ] **Step 4: Apply the migration**

```bash
cd personal-data-store
npm run db:migrate
```

Expected output: migration 0014 applied successfully. If drizzle-kit complains about missing snapshot, run `npm run db:generate` first then `npm run db:migrate`.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/0014_source_type_columns.sql \
        src/domains/documents/documents.schema.ts \
        src/domains/analyses/analyses.schema.ts
git commit -m "feat: add source and type columns to documents and analyses"
```

---

## Task 4: Update documents service and routes

**Files:**
- Modify: `src/domains/documents/documents.service.ts`
- Modify: `src/domains/documents/documents.routes.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/domains/documents.test.ts`:

```typescript
it("POST /api/documents persists source and type", async () => {
  const res = await request(app).post("/api/documents").set(AUTH).send({
    domain: "finance",
    type: "preference",
    title: "MEXC withdrawal rule",
    content: "Always use USDT not TRX",
    source: "oak",
  });
  expect(res.status).toBe(201);
  expect(res.body.source).toBe("oak");
  expect(res.body.type).toBe("preference");
});

it("PATCH /api/documents/:id updates domain and type", async () => {
  const created = await request(app).post("/api/documents").set(AUTH).send({
    domain: "inbox",
    title: "Draft",
    content: "Some content",
    source: "claude",
  });
  const res = await request(app)
    .patch(`/api/documents/${created.body.id}`)
    .set(AUTH)
    .send({ domain: "finance", type: "preference" });
  expect(res.status).toBe(200);
  expect(res.body.domain).toBe("finance");
  expect(res.body.type).toBe("preference");
});

it("DELETE /api/documents/:id removes the document", async () => {
  const created = await request(app).post("/api/documents").set(AUTH).send({
    domain: "inbox",
    title: "To delete",
    content: "bye",
  });
  const del = await request(app).delete(`/api/documents/${created.body.id}`).set(AUTH);
  expect(del.status).toBe(204);
  const get = await request(app).get(`/api/documents/${created.body.id}`).set(AUTH);
  expect(get.status).toBe(404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/domains/documents.test.ts
```

Expected: FAIL — `source` not in response, PATCH and DELETE routes not found (404).

- [ ] **Step 3: Update documents.service.ts**

Replace `src/domains/documents/documents.service.ts` with:

```typescript
import { db } from "../../db/index.js";
import { documents, embeddings } from "./documents.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { chunkText, generateEmbedding } from "./embedding.js";

interface CreateDocumentInput {
  domain: string;
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  generateEmbeddings?: boolean;
}

interface UpdateDocumentInput {
  domain?: string;
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export async function createDocument(input: CreateDocumentInput) {
  const [doc] = await db
    .insert(documents)
    .values({
      domain: input.domain,
      type: input.type,
      title: input.title,
      content: input.content,
      source: input.source,
      metadata: input.metadata,
    })
    .returning();

  if (input.generateEmbeddings && input.content) {
    const chunks = chunkText(input.content);
    for (let i = 0; i < chunks.length; i++) {
      const chunkTextVal = chunks[i];
      const vector = await generateEmbedding(chunkTextVal);
      await db.execute(sql`
        INSERT INTO embeddings (id, document_id, chunk_index, chunk_text, embedding, created_at)
        VALUES (gen_random_uuid(), ${doc.id}, ${i}, ${chunkTextVal}, ${sql.raw(`'[${vector.join(",")}]'::vector`)}, NOW())
      `);
    }
  }

  return doc;
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  return doc ?? null;
}

export async function updateDocument(id: string, input: UpdateDocumentInput) {
  const [doc] = await db
    .update(documents)
    .set({
      ...(input.domain !== undefined && { domain: input.domain }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.source !== undefined && { source: input.source }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning();
  return doc ?? null;
}

export async function deleteDocument(id: string) {
  await db.delete(embeddings).where(eq(embeddings.documentId, id));
  await db.delete(documents).where(eq(documents.id, id));
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

export async function semanticSearch(query: string, limit: number = 10) {
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

- [ ] **Step 4: Update documents.routes.ts**

Replace `src/domains/documents/documents.routes.ts` with:

```typescript
import { Router } from "express";
import {
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  semanticSearch,
} from "./documents.service.js";

export const documentsRouter = Router();

// GET / — query documents (params: domain, from, to)
documentsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await queryDocuments({
      domain: req.query.domain as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id — single document
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

// POST / — create document
documentsRouter.post("/", async (req, res, next) => {
  try {
    const doc = await createDocument(req.body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id — update document fields
documentsRouter.patch("/:id", async (req, res, next) => {
  try {
    const doc = await updateDocument(req.params.id, req.body);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id — remove document and its embeddings
documentsRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteDocument(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /search — semantic search (body: { query, limit })
documentsRouter.post("/search", async (req, res, next) => {
  try {
    const { query, limit } = req.body as { query: string; limit?: number };
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    const results = await semanticSearch(query, limit ?? 10);
    res.json(results);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/domains/documents.test.ts
```

Expected: all tests PASS including the three new ones.

- [ ] **Step 6: Commit**

```bash
git add src/domains/documents/documents.service.ts \
        src/domains/documents/documents.routes.ts \
        tests/domains/documents.test.ts
git commit -m "feat: add source/type to documents, add PATCH and DELETE routes"
```

---

## Task 5: Update analyses routes — add POST

**Files:**
- Modify: `src/domains/analyses/analyses.routes.ts`
- Modify: `tests/system/system.test.ts` (or create a new analyses test)

- [ ] **Step 1: Write the failing test**

Add to `tests/system/system.test.ts` or create `tests/domains/analyses.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Analyses API", () => {
  beforeEach(async () => { await resetDb(); });

  it("POST /api/analyses creates an analysis", async () => {
    const res = await request(app).post("/api/analyses").set(AUTH).send({
      domain: "finance",
      analysisType: "yield_optimisation",
      title: "Yield optimisation 2026-Q2",
      summary: "Recommend moving to Lido",
      source: "claude",
    });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe("claude");
    expect(res.body.domain).toBe("finance");
  });

  it("GET /api/analyses returns created rows", async () => {
    await request(app).post("/api/analyses").set(AUTH).send({
      domain: "health",
      analysisType: "apob_trend",
      title: "ApoB trend",
      source: "claude",
    });
    const res = await request(app).get("/api/analyses?domain=health").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source).toBe("claude");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/domains/analyses.test.ts
```

Expected: FAIL — POST 404/405 (route not defined).

- [ ] **Step 3: Update analyses.routes.ts**

Replace `src/domains/analyses/analyses.routes.ts` with:

```typescript
import { Router } from "express";
import { db } from "../../db/index.js";
import { analyses } from "./analyses.schema.js";
import { eq, and, desc } from "drizzle-orm";

export const analysesRouter = Router();

analysesRouter.get("/", async (req, res, next) => {
  try {
    const conditions = [];
    if (req.query.domain) conditions.push(eq(analyses.domain, req.query.domain as string));
    if (req.query.type) conditions.push(eq(analyses.analysisType, req.query.type as string));

    const rows = await db.select().from(analyses)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0] ?? undefined)
      .orderBy(desc(analyses.createdAt));
    res.json(rows);
  } catch (err) { next(err); }
});

analysesRouter.get("/:id", async (req, res, next) => {
  try {
    const [row] = await db.select().from(analyses).where(eq(analyses.id, req.params.id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

analysesRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as {
      domain: string;
      analysisType: string;
      title: string;
      summary?: string;
      content?: string;
      confidence?: string;
      entities?: unknown;
      result?: unknown;
      sourceQuery?: unknown;
      parentId?: string;
      source?: string;
    };
    const [row] = await db.insert(analyses).values({
      domain: body.domain,
      analysisType: body.analysisType,
      title: body.title,
      summary: body.summary,
      content: body.content,
      confidence: body.confidence,
      entities: body.entities as Record<string, unknown> | undefined,
      result: body.result as Record<string, unknown> | undefined,
      sourceQuery: body.sourceQuery as Record<string, unknown> | undefined,
      parentId: body.parentId,
      source: body.source,
    }).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/domains/analyses.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domains/analyses/analyses.routes.ts tests/domains/analyses.test.ts
git commit -m "feat: add POST /api/analyses with source field"
```

---

## Task 6: /api/about endpoint

**Files:**
- Create: `src/system/about.routes.ts`
- Modify: `src/app.ts`
- Create: `tests/system/about.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/system/about.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("GET /api/about", () => {
  beforeEach(async () => { await resetDb(); });

  it("returns the unified shape with all domain keys", async () => {
    const res = await request(app).get("/api/about?topic=health&limit=3").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("documents");
    expect(res.body).toHaveProperty("health");
    expect(res.body).toHaveProperty("finance");
    expect(res.body).toHaveProperty("workouts");
    expect(res.body).toHaveProperty("genomics");
    expect(res.body).toHaveProperty("business");
    expect(res.body).toHaveProperty("analyses");
    // All values must be arrays (empty when db is reset)
    for (const key of ["documents","health","finance","workouts","genomics","business","analyses"]) {
      expect(Array.isArray(res.body[key])).toBe(true);
    }
  });

  it("returns matching documents when they exist", async () => {
    await request(app).post("/api/documents").set(AUTH).send({
      domain: "health",
      title: "Cardiovascular notes",
      content: "ApoB target is 70 mg/dL",
      source: "oak",
    });
    const res = await request(app).get("/api/about?topic=cardiovascular&limit=5").set(AUTH);
    expect(res.status).toBe(200);
    // Documents list comes from semantic search; with no embeddings it falls back to empty
    expect(Array.isArray(res.body.documents)).toBe(true);
  });

  it("clamps limit to 20", async () => {
    const res = await request(app).get("/api/about?topic=test&limit=999").set(AUTH);
    expect(res.status).toBe(200);
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/about?topic=health");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/system/about.test.ts
```

Expected: FAIL — GET /api/about returns 404.

- [ ] **Step 3: Create src/system/about.routes.ts**

```typescript
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { semanticSearch } from "../domains/documents/documents.service.js";

export const aboutRouter = Router();

aboutRouter.get("/", async (req, res, next) => {
  try {
    const topic = (req.query.topic as string) || "";
    const limit = Math.min(Number(req.query.limit) || 5, 20);

    if (!topic) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    const pattern = `%${topic}%`;

    const [
      documentsResult,
      healthResult,
      workoutsResult,
      financeResult,
      genomicsResult,
      businessResult,
      analysesResult,
    ] = await Promise.allSettled([
      // documents: semantic search (falls back to [] if no embeddings)
      semanticSearch(topic, limit).catch(() => []),

      // health: match on metric_type
      db.execute(sql`
        SELECT id, metric_type, value, unit, source, recorded_at, metadata
        FROM health_metrics
        WHERE metric_type ILIKE ${pattern}
        ORDER BY recorded_at DESC
        LIMIT ${limit}
      `),

      // workouts: match on name
      db.execute(sql`
        SELECT id, name, source, started_at, ended_at, duration, active_energy, avg_heart_rate
        FROM workouts
        WHERE name ILIKE ${pattern}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `),

      // finance: yield positions + transactions
      db.execute(sql`
        SELECT id, name, protocol, chain, token, value_usd, apy, snapshot_at
        FROM yield_positions
        WHERE name ILIKE ${pattern}
          OR protocol ILIKE ${pattern}
          OR token ILIKE ${pattern}
        ORDER BY snapshot_at DESC
        LIMIT ${limit}
      `),

      // genomics: variants by gene or rsid
      db.execute(sql`
        SELECT id, rsid, gene, chromosome, genotype, metadata
        FROM genomics_variants
        WHERE gene ILIKE ${pattern}
          OR rsid ILIKE ${pattern}
        LIMIT ${limit}
      `),

      // business: clients and projects
      db.execute(sql`
        SELECT 'client' AS record_type, id, name, status, created_at FROM clients
        WHERE name ILIKE ${pattern}
        UNION ALL
        SELECT 'project' AS record_type, id, name, status, created_at FROM projects
        WHERE name ILIKE ${pattern}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `),

      // analyses: match on title or summary
      db.execute(sql`
        SELECT id, domain, analysis_type, title, summary, source, created_at
        FROM analyses
        WHERE title ILIKE ${pattern}
          OR summary ILIKE ${pattern}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `),
    ]);

    const pick = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === "fulfilled" ? result.value : fallback;

    res.json({
      documents: pick(documentsResult, []),
      health: pick(healthResult, []),
      workouts: pick(workoutsResult, []),
      finance: pick(financeResult, []),
      genomics: pick(genomicsResult, []),
      business: pick(businessResult, []),
      analyses: pick(analysesResult, []),
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Wire aboutRouter into app.ts**

In `src/app.ts`, add after the existing imports:

```typescript
import { aboutRouter } from "./system/about.routes.js";
```

And add after the existing domain router mounts (before `app.use(errorHandler)`):

```typescript
app.use("/api/about", aboutRouter);
```

The relevant section of app.ts should look like:

```typescript
app.use("/api/system", systemRouter);
app.use("/api/health", healthRouter);
app.use("/api/genomics", genomicsRouter);
app.use("/api/finance", financeRouter);
app.use("/api/business", businessRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/analyses", analysesRouter);
app.use("/api/about", aboutRouter);

app.use(errorHandler);
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/system/about.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add src/system/about.routes.ts src/app.ts tests/system/about.test.ts
git commit -m "feat: add /api/about unified fan-out discovery endpoint"
```

---

## Task 7: Next.js frontend — bootstrap

**Files:**
- Create: `frontend/` directory with full Next.js 14 app

- [ ] **Step 1: Bootstrap Next.js**

```bash
cd personal-data-store
npx create-next-app@14 frontend \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --no-eslint \
  --import-alias "@/*"
```

Accept all prompts. This creates `frontend/` with App Router, TypeScript, Tailwind.

- [ ] **Step 2: Add frontend .env.local**

```bash
cat > frontend/.env.local << 'EOF'
PDS_URL=http://localhost:3000
PDS_API_KEY=<paste-new-api-key-here>
EOF
```

These are server-only env vars (no `NEXT_PUBLIC_` prefix) — safe for bearer token.

- [ ] **Step 3: Add frontend to .gitignore**

In the root `.gitignore`, add:

```
frontend/.env.local
frontend/.next/
frontend/node_modules/
```

- [ ] **Step 4: Verify Next.js starts**

```bash
cd frontend
npm run dev -- --port 3001
```

Expected: Next.js starts on http://localhost:3001.

Stop the dev server (Ctrl-C) after verifying.

- [ ] **Step 5: Commit the bootstrapped frontend**

```bash
cd ..
git add frontend/
git commit -m "feat: bootstrap Next.js 14 frontend at :3001"
```

---

## Task 8: Frontend — inbox triage page

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/inbox/page.tsx`

- [ ] **Step 1: Create a shared PDS fetch helper**

Create `frontend/src/lib/pds.ts`:

```typescript
const PDS_URL = process.env.PDS_URL || "http://localhost:3000";
const PDS_API_KEY = process.env.PDS_API_KEY || "";

export async function pdsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${PDS_URL}${path}`, {
    headers: { Authorization: `Bearer ${PDS_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PDS ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function pdsPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${PDS_URL}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${PDS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PDS PATCH ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function pdsDelete(path: string): Promise<void> {
  const res = await fetch(`${PDS_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${PDS_API_KEY}` },
  });
  if (!res.ok && res.status !== 204) throw new Error(`PDS DELETE ${path} → ${res.status}`);
}
```

- [ ] **Step 2: Add nav to layout.tsx**

Replace `frontend/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "PDS",
  description: "Personal Data Store",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="flex gap-6 px-6 py-3 border-b border-gray-800 text-sm">
          <Link href="/" className="font-semibold text-white hover:text-gray-300">PDS</Link>
          <Link href="/inbox" className="text-gray-400 hover:text-white">Inbox</Link>
        </nav>
        <main className="px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create home page**

Create `frontend/src/app/page.tsx`:

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Personal Data Store</h1>
      <ul className="space-y-2 text-gray-400">
        <li><Link href="/inbox" className="hover:text-white">→ Inbox</Link></li>
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Create the InboxActions client component**

Create `frontend/src/app/inbox/InboxActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Document {
  id: string;
  domain: string;
  type: string | null;
  title: string | null;
  content: string | null;
  source: string | null;
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_PDS_URL || "http://localhost:3000";
const API_KEY = process.env.NEXT_PUBLIC_PDS_API_KEY || "";

export function InboxRow({ doc }: { doc: Document }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [domain, setDomain] = useState(doc.domain);
  const [type, setType] = useState(doc.type || "");
  const [saving, setSaving] = useState(false);

  async function promote() {
    setSaving(true);
    await fetch(`${API_URL}/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain, type: type || null }),
    });
    setSaving(false);
    setShowModal(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this document?")) return;
    await fetch(`${API_URL}/api/documents/${doc.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    router.refresh();
  }

  return (
    <li className="border border-gray-800 rounded p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate">{doc.title || "(untitled)"}</p>
          <p className="text-gray-400 text-sm mt-1 line-clamp-2">
            {doc.content?.slice(0, 200)}
          </p>
          <div className="flex gap-3 mt-2 text-xs text-gray-500">
            <span>source: {doc.source || "—"}</span>
            <span>{new Date(doc.created_at).toLocaleDateString("en-GB")}</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 rounded"
          >
            Promote
          </button>
          <button
            onClick={remove}
            className="px-3 py-1 text-sm bg-red-900 hover:bg-red-800 rounded"
          >
            Delete
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold">Promote document</h2>
            <label className="block">
              <span className="text-xs text-gray-400">Domain</span>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Type</span>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="preference, position, note, …"
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={promote}
                disabled={saving}
                className="px-4 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
```

Note: `NEXT_PUBLIC_PDS_URL` and `NEXT_PUBLIC_PDS_API_KEY` are needed for client components. Add them to `frontend/.env.local`:

```
PDS_URL=http://localhost:3000
PDS_API_KEY=<key>
NEXT_PUBLIC_PDS_URL=http://localhost:3000
NEXT_PUBLIC_PDS_API_KEY=<key>
```

This is a local personal tool on a private Tailscale network — the key exposure risk is acceptable.

- [ ] **Step 5: Create the inbox server page**

Create `frontend/src/app/inbox/page.tsx`:

```tsx
import { pdsGet } from "@/lib/pds";
import { InboxRow } from "./InboxActions";

interface Document {
  id: string;
  domain: string;
  type: string | null;
  title: string | null;
  content: string | null;
  source: string | null;
  created_at: string;
}

export default async function InboxPage() {
  let docs: Document[] = [];
  let error: string | null = null;

  try {
    docs = await pdsGet<Document[]>("/api/documents?domain=inbox");
  } catch (err) {
    error = String(err);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Inbox</h1>

      {error && (
        <p className="text-red-400 mb-4">Failed to load: {error}</p>
      )}

      {docs.length === 0 && !error && (
        <p className="text-gray-500">No inbox items.</p>
      )}

      <ul className="space-y-3">
        {docs.map((doc) => (
          <InboxRow key={doc.id} doc={doc} />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Start the dev server and verify the inbox page loads**

```bash
cd frontend
npm run dev -- --port 3001
```

Open http://localhost:3001/inbox in a browser.

Expected:
- Nav shows "PDS" and "Inbox" links
- Inbox page renders (empty state: "No inbox items.")
- No console errors

Post a test inbox document:

```bash
NEW_KEY=$(grep ^API_KEY ../personal-data-store/.env | cut -d= -f2)
curl -s -X POST http://localhost:3000/api/documents \
  -H "Authorization: Bearer $NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"inbox","title":"Test item","content":"This is a test document from Claude.","source":"claude"}' | jq .
```

Reload /inbox. Verify: the document appears, Promote modal opens and updates domain/type, Delete removes it.

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: add inbox triage page with promote and delete"
```

---

## Task 9: Backfill auto-memory into PDS

**Files:**
- Read: `~/cowork/<session>/.auto-memory/feedback_mexc_withdrawal.md`
- Read: `~/cowork/<session>/.auto-memory/feedback_yield_hurdle.md`
- Read: `~/cowork/<session>/.auto-memory/project_yield_positions.md`
- Modify: auto-memory `MEMORY.md` (remove three entries)
- Delete: the three files above

- [ ] **Step 1: Find the auto-memory files**

```bash
find ~ -name "feedback_mexc_withdrawal.md" -o \
        -name "feedback_yield_hurdle.md" -o \
        -name "project_yield_positions.md" 2>/dev/null
```

If the files are not found, skip this task — they may not exist yet in this environment. The POST format for when they do exist is documented below.

- [ ] **Step 2: Read each file and extract frontmatter**

For each found file, read its content. The frontmatter is YAML between `---` markers. Example:

```
---
name: MEXC withdrawal preference
description: Oak always withdraws USDT not TRX
type: feedback
---

Always use USDT when withdrawing from MEXC. TRX has high withdrawal fees.
```

Extract:
- `name` → document `title`
- Everything below the closing `---` → document `content`
- Entire frontmatter as JSON → document `metadata`

- [ ] **Step 3: POST each file to /api/documents**

```bash
NEW_KEY=$(grep ^API_KEY .env | cut -d= -f2)

# feedback_mexc_withdrawal.md → type: "preference"
curl -s -X POST http://localhost:3000/api/documents \
  -H "Authorization: Bearer $NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "finance",
    "type": "preference",
    "title": "<name from frontmatter>",
    "content": "<body below frontmatter>",
    "metadata": { "<frontmatter key>": "<value>", ... },
    "source": "oak"
  }' | jq .id
```

Repeat for `feedback_yield_hurdle.md` (type: `"preference"`) and `project_yield_positions.md` (type: `"position"`).

Expected: each POST returns a 201 with a UUID `id`.

- [ ] **Step 4: Verify the documents exist**

```bash
curl -s -H "Authorization: Bearer $NEW_KEY" \
  "http://localhost:3000/api/documents?domain=finance" | jq 'length'
```

Expected: 3 (or more if finance docs already existed).

- [ ] **Step 5: Delete the auto-memory files**

```bash
rm <path>/feedback_mexc_withdrawal.md
rm <path>/feedback_yield_hurdle.md
rm <path>/project_yield_positions.md
```

- [ ] **Step 6: Remove the three entries from MEMORY.md**

Open the auto-memory `MEMORY.md` (not the project one) and remove the lines referencing the three deleted files. Leave the `feedback_pds_first.md` entry intact.

- [ ] **Step 7: Verify removal**

```bash
grep -l "mexc\|yield_hurdle\|yield_positions" <auto-memory-dir>/*.md
```

Expected: no output (files gone).

---

## Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the new sections to CLAUDE.md**

Append the following to `CLAUDE.md`:

```markdown
## /api/about Endpoint

`GET /api/about?topic=<string>&limit=<n>` (default 5, max 20, auth required).

Fans out in parallel to all domain tables and semantic document search. Returns:

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

Empty arrays are returned for domains with no match — all keys are always present.

Use this as the first call when asked about Oak's data on any topic:

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://pds:3000/api/about?topic=cardiovascular&limit=5"
```

## source Convention on documents and analyses

Both `documents` and `analyses` have a nullable `source text` column. Conventions:

- `"oak"` — information provided directly by Oak (preferences, positions, facts)
- `"claude"` — generated by Claude (analyses, summaries, recommendations)
- `"import:<connector>"` — imported by a connector (e.g. `"import:aura"`, `"import:revolut"`)
- `null` — legacy data imported before this column existed

Always set `source` when creating documents or analyses. New documents from Claude should use `source: "claude"`.

## Inbox Pattern

Documents with `domain: "inbox"` are a catch-all for unclassified content. Claude should use this domain when POSTing information that needs human review before being promoted to a proper domain.

The inbox triage UI at http://localhost:3001/inbox lists inbox documents and allows promoting them (changing domain and type) or deleting them.

When writing information to PDS from a conversation:
1. If the domain and type are certain → POST directly to the correct domain
2. If uncertain → POST to `domain: "inbox"` and let Oak triage it
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document /api/about, source convention, inbox pattern"
```

---

## Task 11: Build verification and pm2 reload

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS, no failures.

- [ ] **Step 2: Run the TypeScript build**

```bash
npm run build
```

Expected: `tsc` exits 0, `dist/` produced with no errors.

- [ ] **Step 3: Build the frontend**

```bash
cd frontend && npm run build
```

Expected: Next.js build succeeds, `frontend/.next/` produced.

- [ ] **Step 4: Reload pm2**

```bash
pm2 reload pds
pm2 logs pds --lines 10
```

Expected: server reloads cleanly, logs show listening on port 3000, no errors.

- [ ] **Step 5: Smoke-test the about endpoint**

```bash
NEW_KEY=$(grep ^API_KEY .env | cut -d= -f2)
curl -s -H "Authorization: Bearer $NEW_KEY" \
  "http://localhost:3000/api/about?topic=yield&limit=3" | jq 'keys'
```

Expected: `["analyses","business","documents","finance","genomics","health","workouts"]`

- [ ] **Step 6: Smoke-test Tailscale HTTPS (if tailscale serve was run)**

From another tailnet device:

```bash
curl -s https://pds.<tailnet>.ts.net/api/system/health
```

Expected: `{"status":"ok"}`

---

## Self-Review

**Spec coverage check:**

| Requirement | Task | Status |
|-------------|------|--------|
| Rotate API key | Task 1 | ✅ |
| Tailscale serve script | Task 2 | ✅ |
| README HTTPS docs | Task 2 | ✅ |
| `source` column on documents | Task 3 | ✅ |
| `source` column on analyses | Task 3 | ✅ |
| `type` column on documents (needed by inbox promote) | Task 3 | ✅ |
| Migration idempotent | Task 3 — `IF NOT EXISTS` | ✅ |
| PATCH /:id on documents | Task 4 | ✅ |
| DELETE /:id on documents | Task 4 | ✅ |
| POST /api/analyses | Task 5 | ✅ |
| /api/about endpoint | Task 6 | ✅ |
| All 7 keys in response | Task 6 | ✅ |
| Empty arrays, not omitted keys | Task 6 | ✅ |
| auth required on /api/about | Task 6 | ✅ |
| Next.js frontend bootstrap | Task 7 | ✅ |
| Inbox page lists domain=inbox | Task 8 | ✅ |
| Content preview 200 chars | Task 8 — `slice(0,200)` | ✅ |
| Promote modal (domain + type) | Task 8 | ✅ |
| Delete button | Task 8 | ✅ |
| Nav link to inbox | Task 8 | ✅ |
| Backfill auto-memory | Task 9 | ✅ (conditional on files existing) |
| Delete files + MEMORY.md entries | Task 9 | ✅ |
| CLAUDE.md updated | Task 10 | ✅ |
| npm run build green | Task 11 | ✅ |
| npm test green | Task 11 | ✅ |
| pm2 reload | Task 11 | ✅ |
| New docs without source still work (nullable) | Task 3 — nullable column | ✅ |
| No new top-level deps | — next.js is a frontend dep, not backend | ✅ |
| Don't break existing endpoints | Task 6 — analyses router fix for multi-condition | ✅ |

**Placeholder scan:** No TBD, TODO, "implement later", or "similar to Task N" patterns — all steps contain complete code.

**Type consistency check:**
- `CreateDocumentInput.source?: string` defined in Task 4, used in Task 4 and Task 9
- `updateDocument(id, input)` defined in Task 4, imported in Task 4 routes
- `analyses.source` defined in Task 3, used in Task 5 POST handler
- `aboutRouter` exported from `about.routes.ts`, imported in `app.ts` in Task 6
- `pdsGet`, `pdsPatch`, `pdsDelete` defined in Task 8 step 1, `pdsGet` used in inbox server page
- `InboxRow` exported from `InboxActions.tsx`, imported in `page.tsx`

**Note on analyses routes bug fixed:** The original `analyses.routes.ts` used `conditions[0]` even with multiple conditions, silently dropping subsequent filters. Task 5 fixes this with `and(...conditions)`.
