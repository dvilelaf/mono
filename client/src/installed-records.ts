/**
 * Persistent install-time records for plug-ins and harnesses.
 *
 * Each record captures the content hashes computed at `jinn solver-plugins add`
 * / `jinn harnesses add` time. The loader reads these at session start and
 * refuses to load any package whose on-disk content has drifted from the
 * recorded hashes (content-hash binding, Phase 3 of the network-trust spec).
 *
 * Storage layout:
 *   ~/.jinn-client/installed-plug-ins.json   — keyed by package name
 *   ~/.jinn-client/installed-harnesses.json  — keyed by package name
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface InstalledRecord {
  version: string;
  manifestHash: string;
  tarballHash: string;
  entryPointHashes: Record<string, string>;
  tier: 0 | 1 | 2 | 3;
  installedAt: string;
  publishedAttestation: string | null;
}

type Records = Record<string, InstalledRecord>;

const plugInsPath = (home: string) =>
  join(home, '.jinn-client', 'installed-plug-ins.json');
const harnessesPath = (home: string) =>
  join(home, '.jinn-client', 'installed-harnesses.json');

function read(p: string): Records {
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, 'utf8')) as Records)
    : {};
}

function write(p: string, r: Records): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(r, null, 2) + '\n', 'utf8');
}

export const readInstalledPlugIns = (home: string): Records =>
  read(plugInsPath(home));

export function writeInstalledPlugIn(
  home: string,
  pkg: string,
  rec: InstalledRecord,
): void {
  const r = readInstalledPlugIns(home);
  r[pkg] = rec;
  write(plugInsPath(home), r);
}

export const readInstalledHarnesses = (home: string): Records =>
  read(harnessesPath(home));

export function writeInstalledHarness(
  home: string,
  pkg: string,
  rec: InstalledRecord,
): void {
  const r = readInstalledHarnesses(home);
  r[pkg] = rec;
  write(harnessesPath(home), r);
}
