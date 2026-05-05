/**
 * Shared formatter for the `jinn solver-plugins recommendations` and
 * `jinn harnesses recommendations` CLI subcommands.
 */

import { homedir } from 'node:os';
import { readRecommendations, type Recommendation } from './queue.js';

export interface FormatOptions {
  kind: 'plug-in' | 'harness';
  addVerb: string; // e.g. 'jinn solver-plugins add' or 'jinn harnesses add'
  home: string;
  limit?: number;
  since?: string; // ISO date string
}

export function formatRecommendations(opts: FormatOptions): string {
  const { kind, addVerb, home, limit = 20, since } = opts;

  const all = readRecommendations(home).filter((r) => r.kind === kind);

  // Filter by --since if provided
  const sinceMs = since ? new Date(since).getTime() : -Infinity;
  const filtered = Number.isFinite(sinceMs) && sinceMs > -Infinity
    ? all.filter((r) => new Date(r.ts).getTime() >= sinceMs)
    : all;

  if (filtered.length === 0) {
    return 'No recommendations to review.\n';
  }

  // Group by (pkg, version) and keep the most-recent entry per group,
  // also accumulating all sourceCorpusEntries seen across duplicates.
  const groups = new Map<string, { recs: Recommendation[] }>();
  for (const rec of filtered) {
    const key = `${rec.pkg}@${rec.version}`;
    const existing = groups.get(key);
    if (existing) {
      existing.recs.push(rec);
    } else {
      groups.set(key, { recs: [rec] });
    }
  }

  // Sort groups: most-recently recommended first
  const sorted = [...groups.entries()].sort(([, a], [, b]) => {
    const latestA = Math.max(...a.recs.map((r) => new Date(r.ts).getTime()));
    const latestB = Math.max(...b.recs.map((r) => new Date(r.ts).getTime()));
    return latestB - latestA;
  });

  const capped = sorted.slice(0, limit);
  const lines: string[] = [];

  for (const [key, { recs }] of capped) {
    const latest = recs.reduce((a, b) =>
      new Date(a.ts) > new Date(b.ts) ? a : b,
    );
    const allSources = [...new Set(recs.flatMap((r) => r.sourceCorpusEntries))];
    const sourceCount = allSources.length;
    const mostRecent = latest.ts;

    lines.push(`${key} (${kind})`);
    // Word-wrap reason at ~80 chars with indentation
    const prefix = '  Reason: ';
    const reasonWords = latest.reason.split(' ');
    let line = prefix;
    for (const word of reasonWords) {
      if (line.length + word.length + 1 > 80 && line.trim().length > prefix.trim().length) {
        lines.push(line);
        line = ' '.repeat(prefix.length) + word;
      } else {
        line += (line === prefix ? '' : ' ') + word;
      }
    }
    if (line.trim()) lines.push(line);
    lines.push(`  Source: ${sourceCount} corpus envelope${sourceCount === 1 ? '' : 's'} (most recent: ${mostRecent})`);
    lines.push(`  Suggested: ${addVerb} ${latest.pkg}`);
    lines.push('');
  }

  return lines.join('\n');
}
