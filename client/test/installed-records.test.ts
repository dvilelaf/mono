import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readInstalledPlugIns,
  writeInstalledPlugIn,
  readInstalledHarnesses,
  writeInstalledHarness,
  type InstalledRecord,
} from '../src/installed-records.js';

const sampleRecord: InstalledRecord = {
  version: '1.2.3',
  manifestHash: 'sha256:' + 'a'.repeat(64),
  tarballHash: 'sha256:' + 'b'.repeat(64),
  entryPointHashes: { 'agents/x.md': 'sha256:' + 'c'.repeat(64) },
  tier: 1,
  installedAt: '2026-05-05T00:00:00Z',
  publishedAttestation: null,
};

describe('installed-records — plug-ins', () => {
  it('returns empty when no file exists', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    expect(readInstalledPlugIns(home)).toEqual({});
  });
  it('round-trips a record', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeInstalledPlugIn(home, '@foo/bar', sampleRecord);
    expect(readInstalledPlugIns(home)['@foo/bar']).toEqual(sampleRecord);
  });
});

describe('installed-records — harnesses', () => {
  it('returns empty when no file exists', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    expect(readInstalledHarnesses(home)).toEqual({});
  });
  it('round-trips a record', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeInstalledHarness(home, '@foo/harness', sampleRecord);
    expect(readInstalledHarnesses(home)['@foo/harness']).toEqual(sampleRecord);
  });
});
