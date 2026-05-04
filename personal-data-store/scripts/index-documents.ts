/**
 * Index files in ~/Documents into the PDS:
 *  - Extracts text (PDF via pdftotext, DOCX via mammoth, XLSX via xlsx, TXT/MD/CSV directly)
 *  - Summarises via `claude -p`
 *  - Embeds the summary via local ollama (nomic-embed-text)
 *  - Upserts on file_hash
 *
 * Usage:
 *   tsx scripts/index-documents.ts                    # full ~/Documents
 *   tsx scripts/index-documents.ts --filter crypto    # only paths containing "crypto"
 *   tsx scripts/index-documents.ts --root /some/dir
 *   tsx scripts/index-documents.ts --limit 20
 */

import "dotenv/config";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { generateEmbedding } from "../src/domains/documents/embedding.js";

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
    concurrency: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--filter") args.filter = argv[++i].toLowerCase();
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--concurrency") args.concurrency = parseInt(argv[++i], 10);
  }
  return args;
}

const SUPPORTED_EXTS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".csv",
  ".txt",
  ".md",
  ".pptx",
  ".pages",
  ".numbers",
]);

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
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
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
  opts: { input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
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
    if (opts.input) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

async function extractPdf(filePath: string): Promise<string> {
  const r = await runCmd("pdftotext", ["-layout", "-q", filePath, "-"], {
    timeoutMs: 60_000,
  });
  if (r.code !== 0) throw new Error(`pdftotext failed: ${r.stderr.slice(0, 200)}`);
  return r.stdout;
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

async function extractCsv(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

async function extractText(filePath: string, ext: string): Promise<string | null> {
  switch (ext) {
    case ".pdf":
      return extractPdf(filePath);
    case ".docx":
      return extractDocx(filePath);
    case ".xlsx":
      return extractXlsx(filePath);
    case ".csv":
    case ".txt":
    case ".md":
      return extractCsv(filePath);
    default:
      return null; // .doc, .pptx, .pages, .numbers — skip for now
  }
}

const CLAUDE_BIN = process.env.CLAUDE_PATH || "/Users/gcd/.local/bin/claude";

function scrubbedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDECODE",
    "CLAUDE_AGENT_SDK_VERSION",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
  ]) {
    delete env[key];
  }
  return env;
}

const META_PREAMBLE_PATTERNS = [
  /^I\s/i,
  /^Let me\b/i,
  /^Could you\b/i,
  /^I'll\b/i,
  /^I'm\b/i,
  /^I've\b/i,
  /^Here's\b/i,
  /^Here is\b/i,
  /^Sure[,!.]/i,
  /^Okay[,!.]/i,
  /^Apologies\b/i,
  /^Sorry\b/i,
  /^Unfortunately\b/i,
];

function sanitiseSummary(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !META_PREAMBLE_PATTERNS.some((re) => re.test(trimmed));
  });
  return kept.join("\n").trim();
}

async function callClaude(prompt: string): Promise<string> {
  const r = await runCmd(
    CLAUDE_BIN,
    ["-p", "--model", "haiku", "--permission-mode", "bypassPermissions"],
    { input: prompt, timeoutMs: 180_000, env: scrubbedEnv() },
  );
  if (r.code !== 0) {
    throw new Error(`claude failed (${r.code}): ${r.stderr.slice(0, 300)}`);
  }
  return r.stdout.trim();
}

async function summariseWithClaude(text: string, filename: string): Promise<string> {
  const truncated = text.slice(0, 4000);
  const prompt = [
    `Filename: ${filename}`,
    "",
    "Summarise this document in 4-6 sentences. Include what type of document it is, who it's from/for, key dates, and main content. Output only the summary, no preamble.",
    "",
    "--- DOCUMENT ---",
    truncated,
  ].join("\n");
  let summary = sanitiseSummary(await callClaude(prompt));

  if (summary.length < 50) {
    const retryPrompt = [
      `Filename: ${filename}`,
      "",
      "Write a 4-6 sentence factual summary of this document. Do not include any meta-commentary. Start directly with what the document is.",
      "",
      "--- DOCUMENT ---",
      truncated,
    ].join("\n");
    summary = sanitiseSummary(await callClaude(retryPrompt));
  }

  if (summary.length < 50) {
    summary = `${filename}\n\n${truncated.slice(0, 200).trim()}`;
  }

  return summary;
}

async function fileHashExists(hash: string): Promise<{ id: string; file_path: string | null } | null> {
  const rows = (await db.execute(
    sql`SELECT id, file_path FROM documents WHERE file_hash = ${hash} LIMIT 1`,
  )) as unknown as Array<{ id: string; file_path: string | null }>;
  return rows[0] ?? null;
}

async function upsertFileDocument(input: {
  filePath: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  fileModifiedAt: Date;
  domain: string;
  title: string;
  summary: string;
}): Promise<string> {
  const rows = (await db.execute(sql`
    INSERT INTO documents (
      domain, type, title, content, summary,
      file_path, file_type, file_size, file_hash, file_modified_at,
      last_indexed_at, status
    ) VALUES (
      ${input.domain}, 'file', ${input.title}, ${input.summary}, ${input.summary},
      ${input.filePath}, ${input.fileType}, ${input.fileSize}, ${input.fileHash}, ${input.fileModifiedAt.toISOString()},
      NOW(), 'active'
    )
    ON CONFLICT (file_hash) DO UPDATE SET
      file_path = EXCLUDED.file_path,
      file_modified_at = EXCLUDED.file_modified_at,
      last_indexed_at = NOW(),
      status = 'active',
      summary = EXCLUDED.summary,
      content = EXCLUDED.content,
      title = EXCLUDED.title,
      domain = EXCLUDED.domain
    RETURNING id
  `)) as unknown as Array<{ id: string }>;
  return rows[0].id;
}

async function replaceEmbedding(documentId: string, text: string, vector: number[]) {
  await db.execute(sql`DELETE FROM embeddings WHERE document_id = ${documentId}`);
  const literal = `[${vector.join(",")}]`;
  await db.execute(sql`
    INSERT INTO embeddings (id, document_id, chunk_index, chunk_text, embedding, created_at)
    VALUES (gen_random_uuid(), ${documentId}, 0, ${text}, ${sql.raw(`'${literal}'::vector`)}, NOW())
  `);
}

type Stats = {
  scanned: number;
  skippedExt: number;
  skippedUnchanged: number;
  movedUpdated: number;
  indexed: number;
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

  console.log(`[indexer] ${idx}/${total} Processing: ${filePath}`);
  let hash: string;
  try {
    hash = await sha256File(filePath);
  } catch (e) {
    stats.errors.push({ path: filePath, error: `hash: ${(e as Error).message}` });
    return;
  }

  const existing = await fileHashExists(hash);
  if (existing) {
    if (existing.file_path !== filePath) {
      await db.execute(
        sql`UPDATE documents SET file_path = ${filePath}, status = 'active', last_indexed_at = NOW() WHERE id = ${existing.id}`,
      );
      stats.movedUpdated++;
    } else {
      stats.skippedUnchanged++;
    }
    return;
  }

  const text = await extractText(filePath, ext).catch((e) => {
    stats.errors.push({ path: filePath, error: `extract: ${(e as Error).message}` });
    return null;
  });
  if (text === null) return;
  if (!text.trim()) {
    stats.skippedExt++;
    return;
  }

  let summary: string;
  try {
    summary = await summariseWithClaude(text, path.basename(filePath));
  } catch (e) {
    stats.errors.push({ path: filePath, error: `summarise: ${(e as Error).message}` });
    return;
  }
  if (!summary) {
    stats.errors.push({ path: filePath, error: "summarise: empty output" });
    return;
  }

  const embeddingText = `${filePath}\n\n${summary}`;
  let vector: number[];
  try {
    vector = await generateEmbedding(embeddingText);
  } catch (e) {
    stats.errors.push({ path: filePath, error: `embed: ${(e as Error).message}` });
    return;
  }

  const parentFolder = path.basename(path.dirname(filePath));
  try {
    const id = await upsertFileDocument({
      filePath,
      fileType: ext.slice(1),
      fileSize: st.size,
      fileHash: hash,
      fileModifiedAt: st.mtime,
      domain: parentFolder || "documents",
      title: path.basename(filePath),
      summary,
    });
    await replaceEmbedding(id, embeddingText, vector);
    stats.indexed++;
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string; cause?: unknown };
    const cause = err.cause as { message?: string; code?: string; detail?: string } | undefined;
    stats.errors.push({
      path: filePath,
      error: `db [${cause?.code ?? err.code ?? "?"}]: ${cause?.message ?? err.message ?? String(e)} | ${cause?.detail ?? err.detail ?? ""}`,
    });
  }
}

async function reconcileMissing(root: string, stats: Stats) {
  const rows = (await db.execute(
    sql`SELECT id, file_path, file_hash FROM documents WHERE type = 'file' AND status = 'active'`,
  )) as unknown as Array<{ id: string; file_path: string | null; file_hash: string | null }>;

  let missing = 0;
  let moved = 0;
  for (const row of rows) {
    if (!row.file_path) continue;
    if (!row.file_path.startsWith(root)) continue;
    try {
      await fs.access(row.file_path);
    } catch {
      // gone — but maybe moved? we can't easily know without re-scanning.
      // Movement detection happened in processFile (hash already in DB → update path).
      // Anything still missing here is genuinely missing.
      await db.execute(
        sql`UPDATE documents SET status = 'missing' WHERE id = ${row.id}`,
      );
      missing++;
    }
  }
  console.log(`[indexer] reconcile: ${missing} marked missing, ${moved} moved`);
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
        console.error(`[indexer] worker error: ${(e as Error).message}`);
      }
    }
  });
  await Promise.all(runners);
}

async function main() {
  const args = parseArgs();
  console.log(`[indexer] root=${args.root} filter=${args.filter ?? "(none)"} concurrency=${args.concurrency}`);

  // Collect files
  const files: string[] = [];
  for await (const f of walk(args.root)) {
    if (args.filter && !f.toLowerCase().includes(args.filter)) continue;
    const ext = path.extname(f).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;
    files.push(f);
    if (args.limit && files.length >= args.limit) break;
  }
  console.log(`[indexer] found ${files.length} candidate files`);

  const stats: Stats = {
    scanned: files.length,
    skippedExt: 0,
    skippedUnchanged: 0,
    movedUpdated: 0,
    indexed: 0,
    errors: [],
  };

  await runWithConcurrency(
    files,
    (file, idx) => processFile(file, stats, idx + 1, files.length),
    args.concurrency,
  );

  await reconcileMissing(args.root, stats);

  console.log("\n[indexer] done");
  console.log(JSON.stringify({
    scanned: stats.scanned,
    indexed: stats.indexed,
    skippedUnchanged: stats.skippedUnchanged,
    movedUpdated: stats.movedUpdated,
    skippedExt: stats.skippedExt,
    errors: stats.errors.length,
  }, null, 2));
  if (stats.errors.length) {
    console.log("\nFirst 20 errors:");
    for (const e of stats.errors.slice(0, 20)) {
      console.log(`  ${e.path}: ${e.error}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
