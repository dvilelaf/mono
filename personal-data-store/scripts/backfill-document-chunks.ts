/**
 * Backfill v2 chunks for documents that have content but no rows in
 * document_chunks. Designed to be run manually:
 *
 *   npx tsx scripts/backfill-document-chunks.ts
 *   npx tsx scripts/backfill-document-chunks.ts --limit 5
 *   npx tsx scripts/backfill-document-chunks.ts --id <document_id>
 *
 * Skips file-backed documents (type='file') — those are owned by the v2
 * indexer and are chunked from disk extraction, not the documents.content
 * column.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { chunkAndEmbed } from "../src/domains/documents/chunk-and-embed.js";

type Args = { limit?: number; id?: string };

function parseArgs(): Args {
  const out: Args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = parseInt(argv[++i], 10);
    else if (a === "--id") out.id = argv[++i];
  }
  return out;
}

async function findCandidates(args: Args): Promise<Array<{ id: string; title: string | null; len: number }>> {
  if (args.id) {
    const rows = (await db.execute(sql`
      SELECT id, title, COALESCE(LENGTH(content), 0) AS len
      FROM documents
      WHERE id = ${args.id}
    `)) as unknown as Array<{ id: string; title: string | null; len: number }>;
    return rows;
  }
  const limitClause = args.limit ? sql`LIMIT ${args.limit}` : sql``;
  const rows = (await db.execute(sql`
    SELECT d.id, d.title, COALESCE(LENGTH(d.content), 0) AS len
    FROM documents d
    LEFT JOIN document_chunks c ON c.document_id = d.id
    WHERE d.content IS NOT NULL
      AND LENGTH(d.content) > 0
      AND (d.type IS DISTINCT FROM 'file')
      AND c.id IS NULL
    GROUP BY d.id
    ORDER BY d.updated_at DESC
    ${limitClause}
  `)) as unknown as Array<{ id: string; title: string | null; len: number }>;
  return rows;
}

async function main() {
  const args = parseArgs();
  const candidates = await findCandidates(args);
  console.log(`[backfill] ${candidates.length} candidate documents`);

  let ok = 0;
  let totalChunks = 0;
  const errors: { id: string; error: string }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const [row] = (await db.execute(sql`
        SELECT content FROM documents WHERE id = ${c.id}
      `)) as unknown as Array<{ content: string | null }>;
      const content = row?.content ?? "";
      const { chunks } = await chunkAndEmbed(c.id, content);
      ok++;
      totalChunks += chunks;
      console.log(`[backfill] ${i + 1}/${candidates.length} ${c.id} (${c.title ?? "untitled"}) → ${chunks} chunks`);
    } catch (err) {
      const msg = (err as Error).message;
      errors.push({ id: c.id, error: msg });
      console.error(`[backfill] ${c.id} failed: ${msg}`);
    }
  }

  console.log(`\n[backfill] done — ok=${ok} chunks=${totalChunks} errors=${errors.length}`);
  if (errors.length) {
    for (const e of errors.slice(0, 10)) console.log(`  ${e.id}: ${e.error}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
