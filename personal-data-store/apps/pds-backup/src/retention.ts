import { readdir, unlink } from "node:fs/promises";
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

  // Keep first-of-month for last M months beyond the daily window.
  // "first of month" = earliest (oldest) dump within that month.
  // Build a map of month → earliest filename, iterating oldest → newest.
  const monthFirst = new Map<string, string>();
  for (const p of [...parsed].reverse()) {
    if (!monthFirst.has(p.month)) monthFirst.set(p.month, p.name);
  }
  // Collect months whose files are NOT already fully covered by keepDaily.
  // A month is "covered" only if every file in it was already kept by keepDaily.
  const dailyKept = parsed.slice(0, policy.keepDaily);
  const dailyKeptMonths = new Set(dailyKept.map((p) => p.month));
  const notDailyMonths = [...monthFirst.keys()].filter(
    (m) => !dailyKeptMonths.has(m),
  );
  // Take the M most recent of those months.
  const monthsSorted = notDailyMonths.sort().reverse();
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
