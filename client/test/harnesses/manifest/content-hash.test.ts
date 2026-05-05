import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeManifestHash,
  computeFileHash,
  computeTarballHash,
  computeEntryPointHashes,
} from '../../../src/harnesses/manifest/content-hash.js';

describe('content-hash helpers', () => {
  it('hashes a manifest deterministically (key-order independent)', () => {
    const a = { name: '@foo/bar', version: '1.2.3', schemaVersion: '1.0.0' };
    const b = { schemaVersion: '1.0.0', name: '@foo/bar', version: '1.2.3' };
    expect(computeManifestHash(a)).toBe(computeManifestHash(b));
    expect(computeManifestHash(a)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('hashes a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-'));
    writeFileSync(join(dir, 'a.md'), 'hello');
    expect(computeFileHash(join(dir, 'a.md'))).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('hashes a directory tree (tarball-equivalent)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.md'), 'a');
    writeFileSync(join(dir, 'src', 'b.md'), 'b');
    writeFileSync(join(dir, 'package.json'), '{"name":"@foo/bar"}');
    const h = computeTarballHash(dir);
    expect(h).toBe(computeTarballHash(dir));
    expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('hashes entry-point files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-'));
    writeFileSync(join(dir, 'a.md'), 'agent-1');
    writeFileSync(join(dir, 'b.md'), 'agent-2');
    expect(computeEntryPointHashes(dir, ['a.md', 'b.md'])).toEqual({
      'a.md': expect.stringMatching(/^sha256:/),
      'b.md': expect.stringMatching(/^sha256:/),
    });
  });

  it('detects content mutation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-'));
    writeFileSync(join(dir, 'a.md'), 'v1');
    const h1 = computeFileHash(join(dir, 'a.md'));
    writeFileSync(join(dir, 'a.md'), 'v2');
    const h2 = computeFileHash(join(dir, 'a.md'));
    expect(h1).not.toBe(h2);
  });
});
