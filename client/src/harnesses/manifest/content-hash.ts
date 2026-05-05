/**
 * Pure content-hash helpers for plug-in and harness install-time binding.
 *
 * All digests are returned as `sha256:<64 hex chars>` strings so they are
 * self-describing and safe to store in JSON without ambiguity.
 *
 * Canonicalisation of object-valued inputs uses RFC 8785 JCS (the same
 * `canonicalize` package used elsewhere in this directory for manifest
 * signing) so that manifest hashes are key-order independent.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { canonicalJson } from '../engine/canonical-json.js';

function sha256Hex(input: Buffer | string): string {
  return 'sha256:' + createHash('sha256').update(input).digest('hex');
}

/**
 * Hash a manifest object deterministically (RFC 8785 JCS, then sha256).
 * Key-order independent: `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce
 * the same digest.
 */
export function computeManifestHash(manifest: unknown): string {
  return sha256Hex(canonicalJson(manifest));
}

/**
 * Hash the raw bytes of a single file on disk.
 */
export function computeFileHash(filePath: string): string {
  return sha256Hex(readFileSync(filePath));
}

/**
 * Hash an ordered subset of entry-point files relative to a package root.
 * Returns a `{ relPath: "sha256:..." }` map.
 */
export function computeEntryPointHashes(
  packageRoot: string,
  entries: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    out[e] = computeFileHash(join(packageRoot, e));
  }
  return out;
}

/**
 * Walk a directory tree in deterministic sorted order and produce a single
 * sha256 digest that covers every file's path + content. Analogous to the
 * manifest's `package.hash` field but uses a simpler `relPath:fileHash`
 * line-joining strategy (suitable for install-record storage).
 */
function listFiles(root: string, base = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full, base));
    else if (st.isFile()) out.push(relative(base, full));
  }
  return out;
}

export function computeTarballHash(packageRoot: string): string {
  const lines = listFiles(packageRoot).map(
    (p) => `${p}:${computeFileHash(join(packageRoot, p))}`,
  );
  return sha256Hex(lines.join('\n'));
}
