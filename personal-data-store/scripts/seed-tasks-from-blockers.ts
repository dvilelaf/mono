// Seed/refresh `tasks` from wiki/20-synthesis/blockers/*.md.
//
// Idempotent: keyed by slug = filename stem. Re-running updates title /
// goalSlug / smallest_next_action but preserves manual status, completedAt,
// notes the operator changed via the API.
//
// Skips files whose frontmatter has `status: resolved` (and reopens nothing —
// resolution is a one-way signal here; existing tasks aren't auto-cancelled
// to avoid clobbering manual state).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { upsertTaskBySlug, backfillGoalIds } from "../src/domains/tasks/tasks.service.js";

const BLOCKERS_DIR = path.resolve(process.cwd(), "wiki/20-synthesis/blockers");

interface ParsedBlocker {
  slug: string;
  title: string;
  goalSlug: string | null;
  smallestNextAction: string | null;
  resolved: boolean;
  domain: string | null;
  smallestNextActionFromFrontmatter: boolean;
  sourcePath: string;
}

function parseFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  if (!text.startsWith("---")) return { fm: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { fm: {}, body: text };
  const block = text.slice(3, end).trim();
  const body = text.slice(end + 4);
  const fm: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return { fm, body };
}

function extractTitle(body: string, fallback: string): string {
  const m = body.match(/^#\s+(?:Blocker:\s*)?(.+?)\s*$/m);
  if (!m) return fallback;
  // Strip any " — RESOLVED ..." suffix.
  return m[1].replace(/\s+—\s+RESOLVED.*$/i, "").trim();
}

function extractSection(body: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "im");
  const m = body.match(re);
  if (!m) return null;
  const text = m[1].trim();
  if (!text) return null;
  // Treat placeholder "_Define._" as no value.
  if (/^_Define\._/i.test(text)) return null;
  return text;
}

function extractGoalSlug(body: string): string | null {
  const re = /^##\s+(?:Blocks?|Blocked)\s+goal\s*\n([\s\S]*?)(?=\n##\s|$)/im;
  const m = body.match(re);
  if (!m) return null;
  const link = m[1].match(/\[([^\]]+)\]\([^\)]+\)/);
  return link ? link[1].trim() : null;
}

async function parseBlocker(file: string): Promise<ParsedBlocker | null> {
  const slug = path.basename(file, ".md");
  const raw = await readFile(file, "utf8");
  const { fm, body } = parseFrontmatter(raw);
  const titleFallback = slug.replace(/-/g, " ");
  const title = extractTitle(body, titleFallback);
  const goalSlug = extractGoalSlug(body);
  // smallest_next_action frontmatter takes precedence (per issue spec); fall
  // back to body section. Treat "_Define._" as missing.
  const fmSna = fm.smallest_next_action && !/^_Define\._/i.test(fm.smallest_next_action) ? fm.smallest_next_action : null;
  const bodySna = extractSection(body, "Smallest next action");
  const smallestNextAction = fmSna ?? bodySna;
  const resolved = (fm.status ?? "").toLowerCase() === "resolved" || /RESOLVED/.test(title);
  return {
    slug,
    title,
    goalSlug,
    smallestNextAction,
    resolved,
    domain: fm.domain ?? null,
    smallestNextActionFromFrontmatter: Boolean(fmSna),
    sourcePath: path.relative(process.cwd(), file),
  };
}

async function main() {
  let entries: string[];
  try {
    entries = await readdir(BLOCKERS_DIR);
  } catch (err) {
    console.error(`[seed-tasks] cannot read ${BLOCKERS_DIR}:`, err);
    process.exit(1);
  }
  const files = entries.filter((f) => f.endsWith(".md")).map((f) => path.join(BLOCKERS_DIR, f));
  let upserted = 0;
  let skipped = 0;
  for (const file of files) {
    const parsed = await parseBlocker(file);
    if (!parsed) {
      skipped++;
      continue;
    }
    if (parsed.resolved) {
      console.log(`[seed-tasks] skip ${parsed.slug} (resolved)`);
      skipped++;
      continue;
    }
    await upsertTaskBySlug({
      slug: parsed.slug,
      title: parsed.title,
      source: "blocker",
      sourcePath: parsed.sourcePath,
      goalSlug: parsed.goalSlug,
      smallestNextAction: parsed.smallestNextAction,
      priority: 3,
    });
    upserted++;
    console.log(`[seed-tasks] ${parsed.slug} → goal=${parsed.goalSlug ?? "—"}`);
  }
  const linked = await backfillGoalIds();
  console.log(`[seed-tasks] done. upserted=${upserted} skipped=${skipped} goal_ids_linked=${linked}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-tasks] failed:", err);
  process.exit(1);
});
