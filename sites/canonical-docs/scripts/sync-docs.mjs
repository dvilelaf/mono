#!/usr/bin/env node
// Copies canonical .md files from the repo root into src/content/canonical/
// with normalised frontmatter. Runs as `prebuild` and `predev`.
//
// Source of truth = the markdown at the repo root. The local copies under
// src/content/canonical/ are gitignored and ephemeral.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(SITE_ROOT, '..', '..');
const CONTENT_DIR = resolve(SITE_ROOT, 'src', 'content', 'canonical');

/**
 * The canonical docs, in display order. Summaries are the one-liners
 * Jinn already uses in CLAUDE.md's canonical-docs section.
 */
const DOCS = [
  {
    slug: 'spec',
    file: 'SPEC.md',
    order: 1,
    summary:
      'The protocol loop, roles, contracts, phase boundaries. Read before reasoning about how Jinn works on-chain.',
  },
  {
    slug: 'thesis',
    file: 'THESIS.md',
    order: 2,
    summary:
      'Why Jinn exists. The bet, the non-goals, what we are explicitly not. Read before positioning or pitch.',
  },
  {
    slug: 'brand',
    file: 'BRAND.md',
    order: 3,
    summary:
      'Voice, headless-brand posture, content non-negotiables. Read before any user-facing artifact.',
  },
  {
    slug: 'growth',
    file: 'GROWTH.md',
    order: 4,
    summary:
      'Distribution strategy, target cluster, GTM sequence. Read before planning channels or campaigns.',
  },
  {
    slug: 'glossary',
    file: 'GLOSSARY.md',
    order: 5,
    summary:
      'Jinn-specific terms. Read whenever a domain word appears; never redefine terms locally.',
  },
];

function escapeYaml(s) {
  return String(s).replace(/"/g, '\\"');
}

/**
 * Given raw markdown, return { title, bodyWithoutTitle }.
 * Title is the first H1 (line starting with `# `). If none, returns null
 * and leaves the body untouched.
 */
function extractTitle(raw) {
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+?)\s*$/);
    if (m) {
      const title = m[1].trim();
      // Strip that one line and any single blank line directly after it.
      const before = lines.slice(0, i).join('\n');
      let after = lines.slice(i + 1);
      if (after[0] === '') after = after.slice(1);
      const body = [before, after.join('\n')].filter(Boolean).join('\n');
      return { title, body };
    }
  }
  return { title: null, body: raw };
}

async function main() {
  // Wipe + recreate so removed docs disappear.
  if (existsSync(CONTENT_DIR)) {
    await rm(CONTENT_DIR, { recursive: true });
  }
  await mkdir(CONTENT_DIR, { recursive: true });
  // Keep the .gitkeep alive so the dir survives in version control.
  await writeFile(resolve(CONTENT_DIR, '.gitkeep'), '');

  for (const doc of DOCS) {
    const src = resolve(REPO_ROOT, doc.file);
    if (!existsSync(src)) {
      throw new Error(`sync-docs: missing canonical doc at ${src}`);
    }
    const raw = await readFile(src, 'utf8');
    const { title: extracted, body } = extractTitle(raw);
    const title = extracted ?? doc.file.replace(/\.md$/, '');
    const frontmatter = [
      '---',
      `title: "${escapeYaml(title)}"`,
      `slug: "${doc.slug}"`,
      `order: ${doc.order}`,
      `summary: "${escapeYaml(doc.summary)}"`,
      `sourceFile: "${doc.file}"`,
      '---',
      '',
    ].join('\n');
    const out = frontmatter + body.trimStart();
    const target = resolve(CONTENT_DIR, `${doc.slug}.md`);
    await writeFile(target, out, 'utf8');
    process.stdout.write(`synced ${doc.file} → ${doc.slug}.md\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
