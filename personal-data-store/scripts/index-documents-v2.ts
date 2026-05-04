/**
 * v2 document indexer:
 *  - Walks ~/Documents recursively
 *  - Extracts text (PDF/docx/xlsx/csv/txt/md)
 *  - Splits into 1000-token chunks (100-token overlap)
 *  - Embeds each chunk via local ollama qwen3-embedding:4b (2560-dim)
 *  - Inserts chunks into document_chunks with tsvector for keyword search
 *  - Skips files whose SHA-256 is already in documents.file_hash
 *
 * Usage:
 *   npx tsx scripts/index-documents-v2.ts
 *   npx tsx scripts/index-documents-v2.ts --root ~/Documents --filter crypto --limit 10
 */

import "dotenv/config";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { chunkText, chunkPages, type Chunk } from "../src/domains/documents/chunker.js";
import { embedQwen, vectorLiteral, EMBED_DIM } from "../src/domains/documents/embedding-v2.js";

type Args = {
  root: string;
  filter?: string;
  limit?: number;
  concurrency: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    root: path.join(os.homedir(), "Documents"),
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i].replace(/^~/, os.homedir());
    else if (a === "--filter") args.filter = argv[++i].toLowerCase();
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--concurrency") args.concurrency = parseInt(argv[++i], 10);
  }
  return args;
}

const SUPPORTED_EXTS = new Set([".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md"]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".Trash",
  "Library",
  ".npm",
  ".DS_Store",
]);

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = opts.timeoutMs
      ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs)
      : null;
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

async function extractPdfPages(filePath: string): Promise<string[]> {
  const r = await runCmd("pdftotext", ["-layout", "-q", filePath, "-"], { timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`pdftotext failed: ${r.stderr.slice(0, 200)}`);
  // pdftotext separates pages with form-feed (\f)
  return r.stdout.split("\f");
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractXlsx(filePath: string): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`# ${name}\n${csv}`);
  }
  return parts.join("\n\n");
}

async function extractText(filePath: string, ext: string): Promise<{ chunks: Chunk[] } | null> {
  switch (ext) {
    case ".pdf": {
      const pages = await extractPdfPages(filePath);
      return { chunks: chunkPages(pages) };
    }
    case ".docx": {
      const text = await extractDocx(filePath);
      return { chunks: chunkText(text) };
    }
    case ".xlsx": {
      const text = await extractXlsx(filePath);
      return { chunks: chunkText(text) };
    }
    case ".csv":
    case ".txt":
    case ".md": {
      const text = await fs.readFile(filePath, "utf8");
      return { chunks: chunkText(text) };
    }
    default:
      return null;
  }
}

async function fileHashExists(hash: string): Promise<{ id: string; file_path: string | null } | null> {
  const rows = (await db.execute(
    sql`SELECT id, file_path FROM documents WHERE file_hash = ${hash} LIMIT 1`,
  )) as unknown as Array<{ id: string; file_path: string | null }>;
  return rows[0] ?? null;
}

async function chunksAlreadyIndexed(documentId: string): Promise<boolean> {
  const rows = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM document_chunks WHERE document_id = ${documentId}`,
  )) as unknown as Array<{ n: number }>;
  return (rows[0]?.n ?? 0) > 0;
}

async function upsertDocument(input: {
  filePath: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  fileModifiedAt: Date;
  domain: string;
  title: string;
}): Promise<string> {
  const rows = (await db.execute(sql`
    INSERT INTO documents (
      domain, type, title,
      file_path, file_type, file_size, file_hash, file_modified_at,
      last_indexed_at, status
    ) VALUES (
      ${input.domain}, 'file', ${input.title},
      ${input.filePath}, ${input.fileType}, ${input.fileSize}, ${input.fileHash}, ${input.fileModifiedAt.toISOString()},
      NOW(), 'active'
    )
    ON CONFLICT (file_hash) DO UPDATE SET
      file_path = EXCLUDED.file_path,
      file_modified_at = EXCLUDED.file_modified_at,
      last_indexed_at = NOW(),
      status = 'active',
      title = EXCLUDED.title,
      domain = EXCLUDED.domain
    RETURNING id
  `)) as unknown as Array<{ id: string }>;
  return rows[0].id;
}

async function insertChunks(documentId: string, chunks: Chunk[]) {
  // Wipe any prior chunks for idempotency
  await db.execute(sql`DELETE FROM document_chunks WHERE document_id = ${documentId}`);

  for (const chunk of chunks) {
    if (!chunk.text.trim()) continue;
    let vec: number[];
    try {
      vec = await embedQwen(chunk.text);
    } catch (e) {
      throw new Error(`embed chunk ${chunk.chunkIndex}: ${(e as Error).message}`);
    }
    if (vec.length !== EMBED_DIM) {
      throw new Error(`unexpected dim ${vec.length} on chunk ${chunk.chunkIndex}`);
    }
    const lit = vectorLiteral(vec);
    await db.execute(sql`
      INSERT INTO document_chunks (id, document_id, chunk_index, page_number, text, embedding, tsv, created_at)
      VALUES (
        gen_random_uuid(),
        ${documentId},
        ${chunk.chunkIndex},
        ${chunk.pageNumber ?? null},
        ${chunk.text},
        ${sql.raw(`'${lit}'::vector`)},
        to_tsvector('english', ${chunk.text}),
        NOW()
      )
    `);
  }
}

type Stats = {
  scanned: number;
  skippedExt: number;
  skippedUnchanged: number;
  indexed: number;
  totalChunks: number;
  errors: { path: string; error: string }[];
};

async function processFile(filePath: string, stats: Stats, idx: number, total: number) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    stats.skippedExt++;
    return;
  }

  let st: import("node:fs").Stats;
  try {
    st = await fs.stat(filePath);
  } catch (e) {
    stats.errors.push({ path: filePath, error: `stat: ${(e as Error).message}` });
    return;
  }
  if (st.size === 0 || st.size > 50 * 1024 * 1024) {
    stats.skippedExt++;
    return;
  }

  let hash: string;
  try {
    hash = await sha256File(filePath);
  } catch (e) {
    stats.errors.push({ path: filePath, error: `hash: ${(e as Error).message}` });
    return;
  }

  const existing = await fileHashExists(hash);
  if (existing && (await chunksAlreadyIndexed(existing.id))) {
    stats.skippedUnchanged++;
    if (existing.file_path !== filePath) {
      await db.execute(
        sql`UPDATE documents SET file_path = ${filePath}, status = 'active', last_indexed_at = NOW() WHERE id = ${existing.id}`,
      );
    }
    return;
  }

  const extracted = await extractText(filePath, ext).catch((e) => {
    stats.errors.push({ path: filePath, error: `extract: ${(e as Error).message}` });
    return null;
  });
  if (!extracted) return;
  if (extracted.chunks.length === 0) {
    stats.skippedExt++;
    return;
  }

  const parentFolder = path.basename(path.dirname(filePath));
  let id: string;
  try {
    id = await upsertDocument({
      filePath,
      fileType: ext.slice(1),
      fileSize: st.size,
      fileHash: hash,
      fileModifiedAt: st.mtime,
      domain: parentFolder || "documents",
      title: path.basename(filePath),
    });
  } catch (e) {
    stats.errors.push({ path: filePath, error: `upsert: ${(e as Error).message}` });
    return;
  }

  try {
    await insertChunks(id, extracted.chunks);
    stats.indexed++;
    stats.totalChunks += extracted.chunks.length;
  } catch (e) {
    stats.errors.push({ path: filePath, error: (e as Error).message });
    return;
  }

  if (idx % 10 === 0) {
    console.log(
      `[indexer-v2] ${idx}/${total} indexed=${stats.indexed} chunks=${stats.totalChunks} skipped=${stats.skippedUnchanged} errors=${stats.errors.length}`,
    );
  }
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, idx: number) => Promise<void>,
  concurrency: number,
) {
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await worker(items[i], i);
      } catch (e) {
        console.error(`[indexer-v2] worker error: ${(e as Error).message}`);
      }
    }
  });
  await Promise.all(runners);
}

const HEARTBEAT_FLAG = "/tmp/pds-indexer-v2.flag";

async function main() {
  const args = parseArgs();
  console.log(
    `[indexer-v2] root=${args.root} filter=${args.filter ?? "(none)"} limit=${args.limit ?? "(none)"} concurrency=${args.concurrency}`,
  );

  await fs.writeFile(HEARTBEAT_FLAG, String(process.pid)).catch(() => {});
  const heartbeat = setInterval(() => {
    fs.utimes(HEARTBEAT_FLAG, new Date(), new Date()).catch(() => {});
  }, 10_000);
  heartbeat.unref();
  const cleanup = () => {
    clearInterval(heartbeat);
    fs.unlink(HEARTBEAT_FLAG).catch(() => {});
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("SIGTERM", () => { cleanup(); process.exit(143); });

  const files: string[] = [];
  for await (const f of walk(args.root)) {
    if (args.filter && !f.toLowerCase().includes(args.filter)) continue;
    const ext = path.extname(f).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;
    files.push(f);
    if (args.limit && files.length >= args.limit) break;
  }
  console.log(`[indexer-v2] found ${files.length} candidate files`);

  const stats: Stats = {
    scanned: files.length,
    skippedExt: 0,
    skippedUnchanged: 0,
    indexed: 0,
    totalChunks: 0,
    errors: [],
  };

  await runWithConcurrency(
    files,
    (file, idx) => processFile(file, stats, idx + 1, files.length),
    args.concurrency,
  );

  console.log("\n[indexer-v2] done");
  console.log(
    JSON.stringify(
      {
        scanned: stats.scanned,
        indexed: stats.indexed,
        totalChunks: stats.totalChunks,
        skippedUnchanged: stats.skippedUnchanged,
        skippedExt: stats.skippedExt,
        errors: stats.errors.length,
      },
      null,
      2,
    ),
  );
  if (stats.errors.length) {
    console.log("\nFirst 10 errors:");
    for (const e of stats.errors.slice(0, 10)) {
      console.log(`  ${e.path}: ${e.error}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
