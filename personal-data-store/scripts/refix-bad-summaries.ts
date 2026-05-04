/**
 * Find docs with LLM-meta-preamble summaries and re-summarise + re-embed them.
 * Reuses logic from index-documents.ts via re-extraction from file_path.
 */

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { generateEmbedding } from "../src/domains/documents/embedding.js";

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

async function extractPdf(filePath: string): Promise<string> {
  const r = await runCmd("pdftotext", ["-layout", "-q", filePath, "-"], { timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`pdftotext failed`);
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
    parts.push(`# ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`);
  }
  return parts.join("\n\n");
}

async function extractText(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf": return extractPdf(filePath);
    case ".docx": return extractDocx(filePath);
    case ".xlsx": return extractXlsx(filePath);
    case ".csv":
    case ".txt":
    case ".md": return fs.readFile(filePath, "utf8");
    default: return null;
  }
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

async function replaceEmbedding(documentId: string, text: string, vector: number[]) {
  await db.execute(sql`DELETE FROM embeddings WHERE document_id = ${documentId}`);
  const literal = `[${vector.join(",")}]`;
  await db.execute(sql`
    INSERT INTO embeddings (id, document_id, chunk_index, chunk_text, embedding, created_at)
    VALUES (gen_random_uuid(), ${documentId}, 0, ${text}, ${sql.raw(`'${literal}'::vector`)}, NOW())
  `);
}

async function main() {
  const rows = (await db.execute(sql`
    SELECT id, title, file_path, summary FROM documents
    WHERE type='file' AND file_path IS NOT NULL
      AND (summary LIKE '%I can see%' OR summary LIKE '%I misread%'
           OR summary LIKE '%Could you provide%')
  `)) as unknown as Array<{ id: string; title: string; file_path: string; summary: string }>;

  console.log(`[refix] found ${rows.length} bad summaries`);
  let fixed = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`[refix] ${i + 1}/${rows.length} ${row.file_path}`);
    try {
      await fs.access(row.file_path);
    } catch {
      console.log(`  -> file missing, skipping`);
      continue;
    }
    try {
      const text = await extractText(row.file_path);
      if (!text || !text.trim()) {
        console.log(`  -> no extractable text`);
        continue;
      }
      const summary = await summariseWithClaude(text, path.basename(row.file_path));
      const embeddingText = `${row.file_path}\n\n${summary}`;
      const vector = await generateEmbedding(embeddingText);
      await db.execute(sql`UPDATE documents SET summary = ${summary}, content = ${summary}, last_indexed_at = NOW() WHERE id = ${row.id}`);
      await replaceEmbedding(row.id, embeddingText, vector);
      fixed++;
    } catch (e) {
      failed++;
      console.log(`  -> error: ${(e as Error).message}`);
    }
  }
  console.log(`[refix] done: fixed=${fixed} failed=${failed}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
