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

// ── Local block lists ────────────────────────────────────────────────────────

/**
 * Locally blocked plug-in / harness names. The `block` CLI verb writes here;
 * the runtime loader respects this list at boot to refuse loading blocked packages.
 */

type BlockedList = string[];

const blockedPlugInsPath = (home: string) =>
  join(home, '.jinn-client', 'blocked-plug-ins.json');
const blockedHarnessesPath = (home: string) =>
  join(home, '.jinn-client', 'blocked-harnesses.json');

function readBlocked(p: string): BlockedList {
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as BlockedList) : [];
}

function writeBlocked(p: string, list: BlockedList): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

export function readBlockedPlugIns(home: string): BlockedList {
  return readBlocked(blockedPlugInsPath(home));
}

export function addBlockedPlugIn(home: string, pkg: string): void {
  const list = readBlockedPlugIns(home);
  if (!list.includes(pkg)) {
    list.push(pkg);
    writeBlocked(blockedPlugInsPath(home), list);
  }
}

export function readBlockedHarnesses(home: string): BlockedList {
  return readBlocked(blockedHarnessesPath(home));
}

export function addBlockedHarness(home: string, pkg: string): void {
  const list = readBlockedHarnesses(home);
  if (!list.includes(pkg)) {
    list.push(pkg);
    writeBlocked(blockedHarnessesPath(home), list);
  }
}
