import { spawn } from "node:child_process";
import type { Connector, SyncResult } from "./connector.interface.js";
import { createDocument } from "../domains/documents/documents.service.js";
import { createMessage } from "../domains/messages/messages.service.js";
import { db } from "../db/index.js";
import { documents } from "../domains/documents/documents.schema.js";
import { sql } from "drizzle-orm";

const CLAUDE_BIN = process.env.CLAUDE_PATH ?? process.env.CLAUDE_BIN ?? "claude";
const CLAUDE_TIMEOUT_MS = parseInt(
  process.env.ZEC_MONITOR_CLAUDE_TIMEOUT_MS ?? String(15 * 60 * 1000),
  10,
);

const REPORT_OPEN = "<<<REPORT_BEGIN>>>";
const REPORT_CLOSE = "<<<REPORT_END>>>";
const META_OPEN = "<<<META_BEGIN>>>";
const META_CLOSE = "<<<META_END>>>";

type ReportMeta = {
  priority?: "normal" | "high";
  triggers_close?: string[];
  exit_rules_close?: string[];
  headline?: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchThesis(): Promise<{ title: string; content: string } | null> {
  const literal = `{"finance.zcash"}`;
  const rows = await db
    .select({ title: documents.title, content: documents.content })
    .from(documents)
    .where(sql`${documents.canonicalFor} && ${literal}::text[]`)
    .orderBy(sql`${documents.updatedAt} DESC`)
    .limit(1);
  if (!rows.length) return null;
  return { title: rows[0].title ?? "ZEC thesis", content: rows[0].content ?? "" };
}

async function fetchLastReport(): Promise<{ title: string; content: string; createdAt: Date } | null> {
  const rows = await db.execute(sql`
    SELECT title, content, created_at
    FROM documents
    WHERE domain = 'finance' AND type = 'zec-monitor'
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as Array<{ title: string | null; content: string | null; created_at: string }>;
  if (!rows.length) return null;
  return {
    title: rows[0].title ?? "Previous report",
    content: rows[0].content ?? "",
    createdAt: new Date(rows[0].created_at),
  };
}

function washEnv(): NodeJS.ProcessEnv {
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

async function runClaudeCli(prompt: string): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(
      CLAUDE_BIN,
      ["-p", "--permission-mode", "bypassPermissions"],
      { env: washEnv(), stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), CLAUDE_TIMEOUT_MS);
    child.stdout.on("data", (c) => { stdout += c.toString(); });
    child.stderr.on("data", (c) => { stderr += c.toString(); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, stdout, stderr, code });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr: stderr + `\n[spawn error] ${err.message}`, code: null });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function extractBetween(s: string, open: string, close: string): string | null {
  const i = s.indexOf(open);
  if (i < 0) return null;
  const j = s.indexOf(close, i + open.length);
  if (j < 0) return null;
  return s.slice(i + open.length, j).trim();
}

function parseMeta(raw: string | null): ReportMeta {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") return obj as ReportMeta;
  } catch {
    // fall through
  }
  return {};
}

function buildPrompt(args: {
  date: string;
  thesisTitle: string;
  thesis: string;
  lastReport: { title: string; content: string; createdAt: Date } | null;
}): string {
  const lastBlock = args.lastReport
    ? [
        `Previous report (${args.lastReport.createdAt.toISOString().slice(0, 10)}):`,
        "<previous-report>",
        args.lastReport.content,
        "</previous-report>",
      ].join("\n")
    : "No previous report on file. This is the first run.";
  return [
    `You are the WEEKLY ZEC POSITION MONITOR for Oak's Personal Data Store.`,
    `Today's date is ${args.date}. Use British English throughout.`,
    "",
    "You will research the current state of Zcash (ZEC) and produce a delta report grounded against the canonical thesis below.",
    "",
    "=== RESEARCH CHECKLIST ===",
    "Use web search and any other tools available to find the latest data on:",
    "1. Current ZEC spot price (USD) and the ZEC/BTC ratio. Trend over the last 7 and 30 days.",
    "2. Shielded supply percentage — current value and trend. The thesis milestone is >30% sustained for two months.",
    "3. Net shielded inflow direction — is shielded supply growing or shrinking week-on-week?",
    "4. Crosslink (Zcash <-> Bitcoin merge-mining / ZSA / NU6 etc.) development status. Any new commits, GitHub activity, blog posts, audit progress, ECC / ZF / Zashi announcements.",
    "5. Exchange listings/delistings — especially any movement related to AMLR (EU MiCA / Anti Money Laundering Regulation) impact on privacy coins.",
    "6. Regulatory developments anywhere in the world relevant to privacy coins (US, EU, UK, Japan, Korea).",
    "7. Multicoin Capital and other institutional / fund activity around ZEC. On-chain whale moves if visible.",
    "",
    "=== GROUNDING ===",
    `Compare every finding against the thesis (titled "${args.thesisTitle}") below. Specifically check:`,
    "- Are any tranche-entry triggers in the thesis closer to firing than they were last week?",
    "- Are any exit rules in the thesis closer to firing?",
    "- Has any milestone (e.g. shielded > 30%) been hit, or moved meaningfully?",
    "",
    "=== OUTPUT FORMAT ===",
    "Output EXACTLY two blocks, in order, and NOTHING ELSE outside them. No preamble, no trailing commentary, no code fences.",
    "",
    `${REPORT_OPEN}`,
    "(Markdown delta report goes here. ~400-700 words. Structure:",
    "  # ZEC weekly monitor — <date>",
    "  ## Headline",
    "  One sentence on net direction since last report.",
    "  ## What changed",
    "  Bullet deltas for price, ZEC/BTC, shielded %, net shielded flow, dev, listings, regulation, institutional.",
    "  ## Thesis check",
    "  For each tranche trigger and exit rule, state: closer / further / no change, with the relevant number.",
    "  ## Action triggers",
    "  Anything that fires now or is within 10% of firing. Empty list if none.",
    "  ## Sources",
    "  Inline links/citations are fine; collect the key ones here.)",
    `${REPORT_CLOSE}`,
    "",
    `${META_OPEN}`,
    `{"priority":"normal|high","triggers_close":["..."],"exit_rules_close":["..."],"headline":"one short sentence"}`,
    `${META_CLOSE}`,
    "",
    'Set priority to "high" if any tranche trigger or exit rule has fired or is within 10% of firing; otherwise "normal".',
    "",
    "=== CANONICAL THESIS ===",
    `<thesis title="${args.thesisTitle}">`,
    args.thesis,
    "</thesis>",
    "",
    "=== CONTEXT ===",
    lastBlock,
    "",
    "Begin research now. Output only the two marker blocks.",
  ].join("\n");
}

export const zecMonitorConnector: Connector = {
  name: "zec_monitor",
  schedule: process.env.ZEC_MONITOR_SCHEDULE ?? "0 8 * * 1",
  async sync(): Promise<SyncResult> {
    const errors: string[] = [];
    const date = todayISO();

    const thesis = await fetchThesis();
    if (!thesis || !thesis.content.trim()) {
      const msg = "No canonical ZEC thesis document found (canonical_for ⊇ {finance.zcash}).";
      errors.push(msg);
      return { recordsSynced: 0, errors };
    }

    let lastReport: Awaited<ReturnType<typeof fetchLastReport>> = null;
    try {
      lastReport = await fetchLastReport();
    } catch (err) {
      errors.push(`fetch last report: ${err instanceof Error ? err.message : String(err)}`);
    }

    const prompt = buildPrompt({
      date,
      thesisTitle: thesis.title,
      thesis: thesis.content,
      lastReport,
    });

    const cli = await runClaudeCli(prompt);
    if (!cli.ok) {
      errors.push(`claude cli exit=${cli.code}: ${cli.stderr.slice(-500)}`);
      return { recordsSynced: 0, errors };
    }

    const reportBody = extractBetween(cli.stdout, REPORT_OPEN, REPORT_CLOSE);
    const metaRaw = extractBetween(cli.stdout, META_OPEN, META_CLOSE);
    const meta = parseMeta(metaRaw);

    if (!reportBody) {
      errors.push("claude output missing report markers; persisting raw stdout instead");
    }
    const content = reportBody ?? cli.stdout.trim();
    const isHigh = meta.priority === "high"
      || (meta.triggers_close?.length ?? 0) > 0
      || (meta.exit_rules_close?.length ?? 0) > 0;

    let documentId: string | undefined;
    try {
      const doc = await createDocument({
        domain: "finance",
        type: "zec-monitor",
        title: `ZEC weekly monitor — ${date}`,
        content,
        source: "zec-monitor:cron",
        metadata: {
          date,
          thesisTitle: thesis.title,
          priority: isHigh ? "high" : "normal",
          triggersClose: meta.triggers_close ?? [],
          exitRulesClose: meta.exit_rules_close ?? [],
          headline: meta.headline ?? null,
          previousReportAt: lastReport ? lastReport.createdAt.toISOString() : null,
        },
      });
      documentId = doc.id;
    } catch (err) {
      errors.push(`document insert: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const subject = `ZEC monitor — ${date}${isHigh ? " · trigger close" : ""}`;
      const summaryParts: string[] = [];
      if (meta.headline) summaryParts.push(meta.headline);
      if (meta.triggers_close?.length) summaryParts.push(`Triggers close: ${meta.triggers_close.join("; ")}`);
      if (meta.exit_rules_close?.length) summaryParts.push(`Exit rules close: ${meta.exit_rules_close.join("; ")}`);
      const body = content;
      await createMessage({
        type: "zec-monitor",
        subject,
        body,
        priority: isHigh ? 5 : 3,
        metadata: {
          documentId,
          date,
          summary: summaryParts.join(" · ") || (meta.headline ?? "Weekly ZEC delta report ready."),
          priority: isHigh ? "high" : "normal",
          triggersClose: meta.triggers_close ?? [],
          exitRulesClose: meta.exit_rules_close ?? [],
        },
      });
    } catch (err) {
      errors.push(`message insert: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { recordsSynced: 1, errors: errors.length ? errors : undefined };
  },
};
