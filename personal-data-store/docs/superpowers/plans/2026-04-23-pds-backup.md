# PDS Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regular compressed backups of the PDS Postgres database to disk (and optionally iCloud Drive), with verification, retention pruning, and a guarded restore path.

**Architecture:** A new pm2 app `apps/pds-backup/` exposes an HTTP trigger and runs a node-cron daily dump. Each backup shells out to `docker exec personal-data-store-postgres-1 pg_dump -Fc` (compressed custom format, uses the container's matching pg version), redirecting stdout to a timestamped file in `BACKUP_DIR`. After dump, `pg_restore --list` verifies the file is parseable. Retention keeps the last 30 daily + first-of-month for the last 12 months.

**Tech Stack:** TypeScript, Node 22, express 5, node-cron 3, `docker exec` via `child_process.spawn`, pm2 for process supervision. Tests: vitest.

---

## File Structure

Before tasks, the units:

- `apps/pds-backup/package.json` — deps + scripts
- `apps/pds-backup/tsconfig.json` — matches sibling apps
- `apps/pds-backup/src/config.ts` — env resolution (paths, cron, retention, container name)
- `apps/pds-backup/src/dump.ts` — runs pg_dump, writes file, verifies
- `apps/pds-backup/src/retention.ts` — prune old dumps per retention policy
- `apps/pds-backup/src/restore.ts` — guarded restore (rejects unless target DB name is non-prod)
- `apps/pds-backup/src/index.ts` — express + node-cron server
- `apps/pds-backup/src/cli.ts` — `npm run backup|restore|prune`
- `apps/pds-backup/ecosystem.config.cjs` — pm2 config
- `apps/pds-backup/README.md` — usage
- `apps/pds-backup/tests/retention.test.ts` — unit test for prune logic

Everything new; no existing file is modified.

---

## Task 1: Scaffold app + config

**Files:**
- Create: `apps/pds-backup/package.json`
- Create: `apps/pds-backup/tsconfig.json`
- Create: `apps/pds-backup/src/config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pds-backup",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc",
    "backup": "tsx src/cli.ts backup",
    "prune": "tsx src/cli.ts prune",
    "restore": "tsx src/cli.ts restore",
    "test": "vitest run"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^5.1.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/express": "^5.0.2",
    "@types/node": "^22.15.3",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Same as `apps/wiki-jobs/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "..",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*", "../_shared/**/*"]
}
```

- [ ] **Step 3: Create `src/config.ts`**

```ts
import "dotenv/config";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(process.cwd(), "..", "..");

export const config = {
  port: parseInt(process.env.PDS_BACKUP_PORT ?? "3110", 10),
  repoRoot,

  // Postgres target
  containerName: process.env.PG_CONTAINER ?? "personal-data-store-postgres-1",
  pgUser: process.env.PG_USER ?? "pds",
  pgDatabase: process.env.PG_DATABASE ?? "personal_data_store",

  // Backup destination
  backupDir: process.env.BACKUP_DIR ?? path.join(os.homedir(), "Backups", "pds"),
  icloudBackupDir: process.env.ICLOUD_BACKUP_DIR ?? "",

  // Schedule + retention
  cron: process.env.BACKUP_CRON ?? "0 3 * * *", // 03:00 local daily
  cronEnabled: (process.env.BACKUP_CRON_ENABLED ?? "true") === "true",
  keepDaily: parseInt(process.env.BACKUP_KEEP_DAILY ?? "30", 10),
  keepMonthly: parseInt(process.env.BACKUP_KEEP_MONTHLY ?? "12", 10),

  // Misc
  timeoutMs: parseInt(process.env.BACKUP_TIMEOUT_MS ?? String(20 * 60 * 1000), 10),
} as const;
```

- [ ] **Step 4: Install + type-check**

```bash
cd apps/pds-backup && npm install && ./node_modules/.bin/tsc --noEmit
```

Expected: no output (clean type-check).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/pds-backup/package.json apps/pds-backup/package-lock.json apps/pds-backup/tsconfig.json apps/pds-backup/src/config.ts
git commit -m "pds-backup: scaffold app + config"
```

---

## Task 2: Dump function (pg_dump via docker exec) + verification

**Files:**
- Create: `apps/pds-backup/src/dump.ts`

- [ ] **Step 1: Create `src/dump.ts`**

```ts
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type DumpResult = {
  file: string;
  bytes: number;
  startedAt: string;
  finishedAt: string;
};

export async function dump(): Promise<DumpResult> {
  const startedAt = new Date();
  await mkdir(config.backupDir, { recursive: true });

  const stamp = startedAt
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+$/, "");
  const file = path.join(config.backupDir, `pds-${stamp}.dump`);

  // Run pg_dump inside the container; stream its stdout to the host file.
  const args = [
    "exec",
    "-i",
    config.containerName,
    "pg_dump",
    "-U",
    config.pgUser,
    "-d",
    config.pgDatabase,
    "-Fc",
    "--no-owner",
    "--no-acl",
  ];

  await runCmd("docker", args, file);

  const { size } = await stat(file);
  if (size < 1024) {
    throw new Error(`Dump file suspiciously small: ${size} bytes — aborting.`);
  }

  await verify(file);

  return {
    file,
    bytes: size,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

async function verify(file: string): Promise<void> {
  // pg_restore --list parses the dump's TOC; if it errors, the file is corrupt.
  await runCmd("docker", [
    "exec",
    "-i",
    config.containerName,
    "pg_restore",
    "--list",
    "-",
  ], undefined, await readToStdin(file));
}

function runCmd(
  cmd: string,
  args: string[],
  stdoutFile?: string,
  stdinBuffer?: Buffer,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: [
        stdinBuffer ? "pipe" : "ignore",
        stdoutFile ? "pipe" : "inherit",
        "pipe",
      ],
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), config.timeoutMs);
    const errChunks: Buffer[] = [];
    child.stderr?.on("data", (c) => errChunks.push(c));

    if (stdoutFile && child.stdout) {
      const ws = createWriteStream(stdoutFile);
      child.stdout.pipe(ws);
    }
    if (stdinBuffer && child.stdin) {
      child.stdin.end(stdinBuffer);
    }

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve();
      reject(
        new Error(
          `${cmd} ${args.join(" ")} exited ${code}: ${Buffer.concat(errChunks).toString()}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

async function readToStdin(file: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(file);
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/pds-backup && ./node_modules/.bin/tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Dry run against live DB**

```bash
cd apps/pds-backup && npx tsx -e "import('./src/dump.js').then(m => m.dump()).then(r => console.log(JSON.stringify(r, null, 2)))"
```

Expected: JSON with `file`, `bytes > 1024`, timestamps. File appears in `~/Backups/pds/`.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/pds-backup/src/dump.ts
git commit -m "pds-backup: pg_dump via docker exec with verification"
```

---

## Task 3: Retention / prune logic + unit test

**Files:**
- Create: `apps/pds-backup/src/retention.ts`
- Create: `apps/pds-backup/tests/retention.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pds-backup/tests/retention.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectToPrune } from "../src/retention.js";

function mk(dates: string[]): string[] {
  return dates.map((d) => `pds-${d}.dump`);
}

describe("selectToPrune", () => {
  it("keeps the N most recent daily dumps", () => {
    const files = mk([
      "2026-04-23-03-00-00",
      "2026-04-22-03-00-00",
      "2026-04-21-03-00-00",
      "2026-04-20-03-00-00",
    ]);
    const prune = selectToPrune(files, { keepDaily: 2, keepMonthly: 0 });
    expect(prune).toEqual([
      "pds-2026-04-21-03-00-00.dump",
      "pds-2026-04-20-03-00-00.dump",
    ]);
  });

  it("keeps one dump per month for the last M months", () => {
    const files = mk([
      "2026-04-01-03-00-00",
      "2026-04-02-03-00-00", // newer April — keep-daily covers
      "2026-03-15-03-00-00", // first-of-month March
      "2026-03-28-03-00-00", // later March — should prune
      "2026-02-10-03-00-00",
      "2025-12-01-03-00-00", // should prune — older than keepMonthly=2
    ]);
    const prune = selectToPrune(files, { keepDaily: 2, keepMonthly: 2 });
    expect(prune).toContain("pds-2026-03-28-03-00-00.dump");
    expect(prune).toContain("pds-2025-12-01-03-00-00.dump");
    expect(prune).not.toContain("pds-2026-03-15-03-00-00.dump");
    expect(prune).not.toContain("pds-2026-02-10-03-00-00.dump");
  });

  it("ignores files that don't match the pds-<stamp>.dump pattern", () => {
    const files = [
      "pds-2026-04-23-03-00-00.dump",
      "README.md",
      "other.dump",
    ];
    const prune = selectToPrune(files, { keepDaily: 0, keepMonthly: 0 });
    expect(prune).toEqual(["pds-2026-04-23-03-00-00.dump"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/pds-backup && npx vitest run tests/retention.test.ts
```

Expected: FAIL with "Cannot find module '../src/retention.js'" or similar.

- [ ] **Step 3: Implement `src/retention.ts`**

```ts
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export type RetentionPolicy = {
  keepDaily: number;
  keepMonthly: number;
};

const FILE_RE = /^pds-(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}-\d{2}\.dump$/;

/**
 * Given a list of filenames, decide which to prune.
 * - Keep the `keepDaily` most recent dumps outright.
 * - Then keep the first dump of each month for the next `keepMonthly` months.
 * - Everything else is pruned.
 */
export function selectToPrune(
  files: string[],
  policy: RetentionPolicy,
): string[] {
  const parsed = files
    .map((f) => {
      const m = FILE_RE.exec(f);
      if (!m) return null;
      return {
        name: f,
        date: `${m[1]}-${m[2]}-${m[3]}`,
        month: `${m[1]}-${m[2]}`,
      };
    })
    .filter((x): x is { name: string; date: string; month: string } => x !== null)
    .sort((a, b) => (a.name < b.name ? 1 : -1)); // newest first

  const keep = new Set<string>();

  // Keep N most recent
  for (const p of parsed.slice(0, policy.keepDaily)) keep.add(p.name);

  // Keep first-of-month for last M months (scanning newest → oldest,
  // take the *earliest* timestamp within each month we encounter).
  const monthFirst = new Map<string, string>();
  // Iterate oldest → newest so that earlier same-day wins as "first of month".
  for (const p of [...parsed].reverse()) {
    if (!monthFirst.has(p.month)) monthFirst.set(p.month, p.name);
  }
  // Now take the N most recent months
  const monthsSorted = [...monthFirst.keys()].sort().reverse();
  for (const m of monthsSorted.slice(0, policy.keepMonthly)) {
    const name = monthFirst.get(m);
    if (name) keep.add(name);
  }

  return parsed.map((p) => p.name).filter((n) => !keep.has(n));
}

export async function prune(): Promise<{ pruned: string[]; kept: number }> {
  const entries = await readdir(config.backupDir).catch(() => [] as string[]);
  const toDelete = selectToPrune(entries, {
    keepDaily: config.keepDaily,
    keepMonthly: config.keepMonthly,
  });
  for (const name of toDelete) {
    await unlink(path.join(config.backupDir, name)).catch(() => {});
  }
  const remaining = entries.length - toDelete.length;
  return { pruned: toDelete, kept: remaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/pds-backup && npx vitest run tests/retention.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/pds-backup/src/retention.ts apps/pds-backup/tests/retention.test.ts
git commit -m "pds-backup: retention policy + unit tests"
```

---

## Task 4: iCloud mirror (optional)

**Files:**
- Modify: `apps/pds-backup/src/dump.ts`

- [ ] **Step 1: Add mirror function and call after dump**

Append to `src/dump.ts` (after the existing `dump` function):

```ts
import { copyFile } from "node:fs/promises";
import path from "node:path";

export async function mirrorToIcloud(file: string): Promise<string | null> {
  if (!config.icloudBackupDir) return null;
  await mkdir(config.icloudBackupDir, { recursive: true });
  const dest = path.join(config.icloudBackupDir, path.basename(file));
  await copyFile(file, dest);
  return dest;
}
```

Modify the `dump()` return to also call `mirrorToIcloud`:

```ts
// before the return
const mirrored = await mirrorToIcloud(file).catch((e) => {
  console.error("[pds-backup] iCloud mirror failed:", e);
  return null;
});
```

And add `mirrored` to the `DumpResult` type and return:

```ts
export type DumpResult = {
  file: string;
  bytes: number;
  mirrored: string | null;
  startedAt: string;
  finishedAt: string;
};
```

```ts
return {
  file,
  bytes: size,
  mirrored,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
};
```

- [ ] **Step 2: Type-check**

```bash
cd apps/pds-backup && ./node_modules/.bin/tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/pds-backup/src/dump.ts
git commit -m "pds-backup: optional iCloud mirror"
```

---

## Task 5: Guarded restore script

**Files:**
- Create: `apps/pds-backup/src/restore.ts`

- [ ] **Step 1: Create `src/restore.ts`**

```ts
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { config } from "./config.js";

export type RestoreOptions = {
  file: string;
  targetDb: string;
  allowProdRestore?: boolean;
};

export async function restore(opts: RestoreOptions): Promise<void> {
  // Guard: refuse to restore over the prod DB unless explicitly allowed.
  const looksLikeTest = /test|restore|scratch/i.test(opts.targetDb);
  if (!looksLikeTest && !opts.allowProdRestore) {
    throw new Error(
      `restore() refused: target database "${opts.targetDb}" doesn't look like a scratch/test DB. ` +
        `Pass --allow-prod to override.`,
    );
  }

  const st = await stat(opts.file);
  if (st.size < 1024) {
    throw new Error(`Dump file too small: ${opts.file}`);
  }

  const dumpBytes = await readFile(opts.file);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        config.containerName,
        "pg_restore",
        "-U",
        config.pgUser,
        "-d",
        opts.targetDb,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    child.stdin.end(dumpBytes);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pg_restore exited ${code}`)),
    );
    child.on("error", reject);
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/pds-backup && ./node_modules/.bin/tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/pds-backup/src/restore.ts
git commit -m "pds-backup: guarded restore against non-prod target DB"
```

---

## Task 6: CLI + express + cron

**Files:**
- Create: `apps/pds-backup/src/cli.ts`
- Create: `apps/pds-backup/src/index.ts`

- [ ] **Step 1: Create `src/cli.ts`**

```ts
import { dump } from "./dump.js";
import { prune } from "./retention.js";
import { restore } from "./restore.js";

const cmd = process.argv[2];

async function main() {
  if (cmd === "backup") {
    const r = await dump();
    await prune();
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (cmd === "prune") {
    const r = await prune();
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (cmd === "restore") {
    const file = process.argv[3];
    const targetDb = process.argv[4];
    const allowProd = process.argv.includes("--allow-prod");
    if (!file || !targetDb) {
      console.error(
        "usage: tsx src/cli.ts restore <dump-file> <target-db-name> [--allow-prod]",
      );
      process.exit(2);
    }
    await restore({ file, targetDb, allowProdRestore: allowProd });
    console.log("restore: ok");
    return;
  }
  console.error("usage: tsx src/cli.ts <backup|prune|restore>");
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Create `src/index.ts`**

```ts
import express from "express";
import cron from "node-cron";
import { config } from "./config.js";
import { dump } from "./dump.js";
import { prune } from "./retention.js";

let running = false;

async function runBackupCycle() {
  if (running) {
    console.log("[pds-backup] skip — already running");
    return;
  }
  running = true;
  try {
    console.log("[pds-backup] dump starting");
    const r = await dump();
    console.log(
      `[pds-backup] dump done: ${r.file} (${r.bytes} bytes)` +
        (r.mirrored ? ` → mirrored: ${r.mirrored}` : ""),
    );
    const p = await prune();
    if (p.pruned.length > 0) {
      console.log(`[pds-backup] pruned ${p.pruned.length} old dumps, kept ${p.kept}`);
    }
  } catch (err) {
    console.error("[pds-backup] dump failed:", err);
  } finally {
    running = false;
  }
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/status", (_req, res) =>
  res.json({
    backupDir: config.backupDir,
    icloudBackupDir: config.icloudBackupDir || null,
    cron: config.cron,
    cronEnabled: config.cronEnabled,
    keepDaily: config.keepDaily,
    keepMonthly: config.keepMonthly,
    running,
  }),
);
app.post("/backup", async (_req, res) => {
  if (running) return res.status(409).json({ error: "already running" });
  runBackupCycle();
  res.json({ status: "started" });
});

if (config.cronEnabled) {
  if (!cron.validate(config.cron)) {
    console.error(`[pds-backup] invalid cron: ${config.cron}`);
  } else {
    cron.schedule(config.cron, runBackupCycle);
    console.log(`[pds-backup] cron: ${config.cron}`);
  }
} else {
  console.log("[pds-backup] cron disabled via env");
}

app.listen(config.port, () => {
  console.log(`[pds-backup] listening on http://localhost:${config.port}`);
  console.log(`[pds-backup] backupDir: ${config.backupDir}`);
});
```

- [ ] **Step 3: Type-check + smoke run**

```bash
cd apps/pds-backup && ./node_modules/.bin/tsc --noEmit
npx tsx src/cli.ts backup
```

Expected: a new dump file appears in `~/Backups/pds/` + JSON printed to stdout.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/pds-backup/src/cli.ts apps/pds-backup/src/index.ts
git commit -m "pds-backup: CLI + express + cron"
```

---

## Task 7: pm2 ecosystem config + README + launch

**Files:**
- Create: `apps/pds-backup/ecosystem.config.cjs`
- Create: `apps/pds-backup/README.md`

- [ ] **Step 1: Create `ecosystem.config.cjs`**

```js
module.exports = {
  apps: [
    {
      name: "pds-backup",
      cwd: __dirname,
      script: "./node_modules/.bin/tsx",
      args: "src/index.ts",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
      out_file: "/tmp/pds-backup.out.log",
      error_file: "/tmp/pds-backup.err.log",
      time: true,
    },
  ],
};
```

- [ ] **Step 2: Create `README.md`**

```markdown
# pds-backup

Daily compressed pg_dump of the PDS Postgres DB. Retention: last 30 daily + first-of-month for last 12 months. Optional iCloud mirror.

## Commands

- `npm run backup` — dump + prune now
- `npm run prune` — prune only
- `npm run restore <file> <target-db> [--allow-prod]` — restore guarded by target DB name

## HTTP

- `GET /status` — config + running flag
- `POST /backup` — trigger a backup now

## Env

- `BACKUP_DIR` (default `~/Backups/pds/`)
- `ICLOUD_BACKUP_DIR` (default empty — no mirror)
- `BACKUP_CRON` (default `0 3 * * *`)
- `BACKUP_KEEP_DAILY` (default 30)
- `BACKUP_KEEP_MONTHLY` (default 12)
- `PDS_BACKUP_PORT` (default 3110)

## Restore example

```bash
# create a scratch DB
docker exec personal-data-store-postgres-1 createdb -U pds pds_restore_test
# restore
npm run restore ~/Backups/pds/pds-2026-04-23-03-00-00.dump pds_restore_test
```

## Pm2

```bash
pm2 start apps/pds-backup/ecosystem.config.cjs
pm2 save
```
```

- [ ] **Step 3: Launch under pm2**

```bash
pm2 start apps/pds-backup/ecosystem.config.cjs
sleep 2
curl -s http://localhost:3110/status
```

Expected: JSON showing config + `"running": false`.

- [ ] **Step 4: Trigger a first run via HTTP**

```bash
curl -s -X POST http://localhost:3110/backup
# wait for it
until curl -s http://localhost:3110/status | grep -q '"running":false'; do sleep 2; done
ls -lh ~/Backups/pds/
```

Expected: at least one `pds-<stamp>.dump` file, non-zero size.

- [ ] **Step 5: Persist across reboots**

```bash
pm2 save
```

- [ ] **Step 6: Commit**

```bash
git add apps/pds-backup/ecosystem.config.cjs apps/pds-backup/README.md
git commit -m "pds-backup: pm2 ecosystem config + README"
```

---

## Task 8: Restore dry-run against a scratch DB

This validates that the dumps are actually usable.

**Files:** no changes — validation only.

- [ ] **Step 1: Create scratch DB**

```bash
docker exec personal-data-store-postgres-1 createdb -U pds pds_restore_test
```

Expected: no output.

- [ ] **Step 2: Restore latest dump into it**

```bash
cd apps/pds-backup
LATEST=$(ls -t ~/Backups/pds/*.dump | head -1)
npx tsx src/cli.ts restore "$LATEST" pds_restore_test
```

Expected: `restore: ok`. Some stderr from pg_restore is normal.

- [ ] **Step 3: Verify row counts match**

```bash
docker exec personal-data-store-postgres-1 psql -U pds -d pds_restore_test -c "
SELECT 'health_metrics' tbl, COUNT(*) FROM health_metrics
UNION ALL SELECT 'workouts', COUNT(*) FROM workouts
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'wallets', COUNT(*) FROM wallets
ORDER BY 1;"
```

Expected: same counts as the live DB.

- [ ] **Step 4: Drop the scratch DB**

```bash
docker exec personal-data-store-postgres-1 dropdb -U pds pds_restore_test
```

Expected: no output.

- [ ] **Step 5: Note the successful restore in the wiki**

Append to `wiki/20-synthesis/goals/data-automation.md` under "What moved":

```markdown
**Backup + restore validated (2026-04-23)** — pds-backup app live under pm2. Daily 03:00 dumps to ~/Backups/pds/. Restore verified against a scratch DB. Retention: 30 daily + 12 monthly.
```

- [ ] **Step 6: Commit wiki update**

```bash
git add personal-data-store/wiki/20-synthesis/goals/data-automation.md
git commit -m "wiki: note backup app live and restore-validated"
```

---

## Done criteria

- [ ] `pds-backup` pm2 app running, health + status endpoints respond
- [ ] At least one dump exists in `~/Backups/pds/`
- [ ] `pg_restore --list` succeeds on that dump (implicit via `dump()` verification)
- [ ] Restore into a scratch DB reproduces live row counts
- [ ] Retention unit tests pass
- [ ] `pm2 save` run (persists across reboots)
