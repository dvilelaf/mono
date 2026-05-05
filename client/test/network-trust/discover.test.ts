/**
 * Unit tests for the discover ranking + formatting module.
 *
 * These tests run against pure functions — no CLI plumbing, RPC, or IPFS.
 */

import { describe, it, expect } from 'vitest';
import { rankDiscovery, formatDiscovery } from '../../src/network-trust/discover.js';
import type { AttestationWithAttestor } from '../../src/network-trust/most-recent-wins.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAtt(
  overrides: Partial<AttestationWithAttestor> & Pick<AttestationWithAttestor, 'attestor' | 'subject' | 'kind'>,
): AttestationWithAttestor {
  return {
    subjectType: 'plug-in',
    version: '1.0.0',
    manifestHash: 'sha256:aaa',
    tarballHash: 'sha256:bbb',
    tier: 1,
    score: overrides.kind === 'endorse' ? 1 : overrides.kind === 'warn' ? -1 : overrides.kind === 'block' ? -2 : 0,
    reason: '',
    reviewCid: '',
    attestedAt: 1000,
    ...overrides,
  };
}

// ── rankDiscovery ─────────────────────────────────────────────────────────────

describe('rankDiscovery', () => {
  it('returns empty for empty input', () => {
    expect(rankDiscovery([])).toEqual([]);
  });

  it('groups attestations by subject and version', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'endorse', version: '1.0.0' }),
      makeAtt({ attestor: '0xB', subject: '@foo/bar', kind: 'endorse', version: '1.0.0' }),
      makeAtt({ attestor: '0xC', subject: '@baz/qux', kind: 'endorse', version: '2.0.0' }),
    ];

    const result = rankDiscovery(atts);
    expect(result).toHaveLength(2);

    const fooBar = result.find((e) => e.subject === '@foo/bar');
    expect(fooBar).toBeDefined();
    expect(fooBar!.versions).toHaveLength(1);
    expect(fooBar!.versions[0]!.endorseCount).toBe(2);
  });

  it('groups multiple versions of the same subject separately', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'endorse', version: '1.0.0' }),
      makeAtt({ attestor: '0xB', subject: '@foo/bar', kind: 'endorse', version: '2.0.0' }),
    ];

    const result = rankDiscovery(atts);
    expect(result).toHaveLength(1);
    expect(result[0]!.versions).toHaveLength(2);
  });

  it('applies most-recent-wins per (attestor, subject, version)', () => {
    // 0xA endorses then warns @foo/bar — the warn (newer) should win.
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'endorse', attestedAt: 1000 }),
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'warn', attestedAt: 2000 }),
    ];

    const result = rankDiscovery(atts);
    expect(result).toHaveLength(1);
    const v = result[0]!.versions[0]!;
    expect(v.endorseCount).toBe(0);
    expect(v.warnCount).toBe(1);
  });

  it('sorts by net positive score desc', () => {
    // @good/pkg: 3 endorsements → score 3
    // @bad/pkg: 1 block → score -2
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@bad/pkg', kind: 'block', attestedAt: 3000 }),
      makeAtt({ attestor: '0xA', subject: '@good/pkg', kind: 'endorse', attestedAt: 1000 }),
      makeAtt({ attestor: '0xB', subject: '@good/pkg', kind: 'endorse', attestedAt: 1000 }),
      makeAtt({ attestor: '0xC', subject: '@good/pkg', kind: 'endorse', attestedAt: 1000 }),
    ];

    const result = rankDiscovery(atts);
    expect(result[0]!.subject).toBe('@good/pkg');
    expect(result[1]!.subject).toBe('@bad/pkg');
  });

  it('filter by subjectType excludes other type', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/plugin', kind: 'endorse', subjectType: 'plug-in' }),
      makeAtt({ attestor: '0xA', subject: '@foo/harness', kind: 'endorse', subjectType: 'harness' }),
    ];

    const plugins = rankDiscovery(atts, { subjectType: 'plug-in' });
    expect(plugins).toHaveLength(1);
    expect(plugins[0]!.subject).toBe('@foo/plugin');

    const harnesses = rankDiscovery(atts, { subjectType: 'harness' });
    expect(harnesses).toHaveLength(1);
    expect(harnesses[0]!.subject).toBe('@foo/harness');
  });

  it('filter by subject narrows to exact match', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'endorse' }),
      makeAtt({ attestor: '0xA', subject: '@foo/baz', kind: 'endorse' }),
    ];

    const result = rankDiscovery(atts, { subject: '@foo/bar' });
    expect(result).toHaveLength(1);
    expect(result[0]!.subject).toBe('@foo/bar');
  });

  it('counts installed attestations separately from endorsements', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'installed', score: 0 }),
      makeAtt({ attestor: '0xB', subject: '@foo/bar', kind: 'installed', score: 0 }),
      makeAtt({ attestor: '0xC', subject: '@foo/bar', kind: 'endorse' }),
    ];

    const result = rankDiscovery(atts);
    const v = result[0]!.versions[0]!;
    expect(v.installedCount).toBe(2);
    expect(v.endorseCount).toBe(1);
  });

  it('tracks mostRecentAttestedAt correctly', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'endorse', attestedAt: 100 }),
      makeAtt({ attestor: '0xB', subject: '@foo/bar', kind: 'endorse', attestedAt: 500 }),
    ];

    const result = rankDiscovery(atts);
    expect(result[0]!.versions[0]!.mostRecentAttestedAt).toBe(500);
  });
});

// ── formatDiscovery ───────────────────────────────────────────────────────────

describe('formatDiscovery', () => {
  it('returns "no plug-ins discovered" message for empty input', () => {
    const out = formatDiscovery([]);
    expect(out).toMatch(/no plug-ins or harnesses discovered/i);
  });

  it('formats a single entry with all kinds counted', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'endorse' }),
      makeAtt({ attestor: '0xB', subject: '@foo/bar', kind: 'endorse' }),
      makeAtt({ attestor: '0xC', subject: '@foo/bar', kind: 'warn', score: -1 }),
      makeAtt({ attestor: '0xD', subject: '@foo/bar', kind: 'installed', score: 0 }),
    ];

    const entries = rankDiscovery(atts);
    const out = formatDiscovery(entries);

    expect(out).toContain('@foo/bar@1.0.0');
    expect(out).toContain('Endorsements');
    expect(out).toContain('Installed by');
    expect(out).toContain('Warnings');
    expect(out).toContain('jinn solver-plugins add @foo/bar');
  });

  it('shows "(not recommended)" when blocks/warnings outweigh endorsements', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@bad/pkg', kind: 'block', score: -2 }),
      makeAtt({ attestor: '0xB', subject: '@bad/pkg', kind: 'block', score: -2 }),
    ];

    const entries = rankDiscovery(atts);
    const out = formatDiscovery(entries);

    expect(out).toContain('(not recommended)');
  });

  it('does not show "(not recommended)" for positively scored entries', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@good/pkg', kind: 'endorse' }),
    ];

    const entries = rankDiscovery(atts);
    const out = formatDiscovery(entries);

    expect(out).not.toContain('(not recommended)');
  });

  it('respects --limit', () => {
    // Create 5 subjects.
    const atts: AttestationWithAttestor[] = ['@a/a', '@b/b', '@c/c', '@d/d', '@e/e'].map(
      (subject) => makeAtt({ attestor: '0xA', subject, kind: 'endorse' }),
    );

    const entries = rankDiscovery(atts);
    const out = formatDiscovery(entries, { limit: 2 });

    // Should mention "and X more".
    expect(out).toMatch(/and \d+ more/i);
  });

  it('uses jinn harnesses add verb for harness subjectType', () => {
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/harness', kind: 'endorse', subjectType: 'harness' }),
    ];

    const entries = rankDiscovery(atts, { subjectType: 'harness' });
    const out = formatDiscovery(entries);

    expect(out).toContain('jinn harnesses add @foo/harness');
  });
});
