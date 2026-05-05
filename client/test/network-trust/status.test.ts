/**
 * Unit tests for the status cross-check module.
 *
 * These tests run against pure functions — no CLI plumbing, RPC, or IPFS.
 */

import { describe, it, expect } from 'vitest';
import { computeStatus, formatStatus } from '../../src/network-trust/status.js';
import type { AttestationWithAttestor } from '../../src/network-trust/most-recent-wins.js';
import type { InstalledRecord } from '../../src/installed-records.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRecord(overrides?: Partial<InstalledRecord>): InstalledRecord {
  return {
    version: '1.0.0',
    manifestHash: 'sha256:aaa',
    tarballHash: 'sha256:bbb',
    entryPointHashes: {},
    tier: 1,
    installedAt: new Date().toISOString(),
    publishedAttestation: null,
    ...overrides,
  };
}

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
    reason: overrides.reason ?? '',
    reviewCid: '',
    attestedAt: 1000,
    ...overrides,
  };
}

// ── computeStatus ─────────────────────────────────────────────────────────────

describe('computeStatus', () => {
  it('returns empty for no installed packages', () => {
    const result = computeStatus({}, [], 'plug-in');
    expect(result).toEqual([]);
  });

  it('shows ok when all signals are positive', () => {
    const installed = { '@good/pkg': makeRecord() };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@good/pkg', kind: 'endorse' }),
      makeAtt({ attestor: '0xB', subject: '@good/pkg', kind: 'endorse' }),
    ];

    const result = computeStatus(installed, atts, 'plug-in');
    expect(result).toHaveLength(1);
    expect(result[0]!.recommendation).toBe('ok');
    expect(result[0]!.endorseCount).toBe(2);
    expect(result[0]!.warnings).toHaveLength(0);
    expect(result[0]!.blocks).toHaveLength(0);
  });

  it('flags installed plug-ins that have warnings from followed attestors', () => {
    const installed = { '@questionable/typo': makeRecord({ version: '0.0.1' }) };
    const atts: AttestationWithAttestor[] = [
      makeAtt({
        attestor: '0xA',
        subject: '@questionable/typo',
        kind: 'warn',
        version: '0.0.1',
        reason: 'subtle crash on edge case',
        score: -1,
      }),
    ];

    const result = computeStatus(installed, atts, 'plug-in');
    expect(result).toHaveLength(1);
    expect(result[0]!.recommendation).toBe('review');
    expect(result[0]!.warnings).toHaveLength(1);
    expect(result[0]!.warnings[0]!.reason).toBe('subtle crash on edge case');
    expect(result[0]!.blocks).toHaveLength(0);
  });

  it('flags blocks with disable recommendation', () => {
    const installed = { '@bad/pkg': makeRecord() };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@bad/pkg', kind: 'block', reason: 'malware', score: -2 }),
    ];

    const result = computeStatus(installed, atts, 'plug-in');
    expect(result).toHaveLength(1);
    expect(result[0]!.recommendation).toBe('disable');
    expect(result[0]!.blocks).toHaveLength(1);
    expect(result[0]!.blocks[0]!.reason).toBe('malware');
  });

  it('matches version exactly — different version does not flag', () => {
    const installed = { '@foo/bar': makeRecord({ version: '1.0.0' }) };
    // The attestation is for version 2.0.0 — should not affect 1.0.0.
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'block', version: '2.0.0', score: -2 }),
    ];

    const result = computeStatus(installed, atts, 'plug-in');
    expect(result).toHaveLength(1);
    expect(result[0]!.recommendation).toBe('ok');
    expect(result[0]!.blocks).toHaveLength(0);
  });

  it('applies most-recent-wins: newer verdict overrides older', () => {
    const installed = { '@foo/bar': makeRecord() };
    // 0xA endorses then blocks — the block (newer) should win.
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'endorse', attestedAt: 1000 }),
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'block', attestedAt: 2000, score: -2 }),
    ];

    const result = computeStatus(installed, atts, 'plug-in');
    expect(result[0]!.recommendation).toBe('disable');
    expect(result[0]!.endorseCount).toBe(0);
  });

  it('filters by subjectType — harness attestations do not flag plug-ins', () => {
    const installed = { '@foo/bar': makeRecord() };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@foo/bar', kind: 'block', subjectType: 'harness', score: -2 }),
    ];

    // computeStatus with 'plug-in' should ignore the harness attestation.
    const result = computeStatus(installed, atts, 'plug-in');
    expect(result[0]!.recommendation).toBe('ok');
  });

  it('sorts: blocks first, then warnings, then ok', () => {
    const installed = {
      '@a/ok': makeRecord(),
      '@b/blocked': makeRecord(),
      '@c/warned': makeRecord(),
    };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@a/ok', kind: 'endorse' }),
      makeAtt({ attestor: '0xA', subject: '@b/blocked', kind: 'block', score: -2 }),
      makeAtt({ attestor: '0xA', subject: '@c/warned', kind: 'warn', score: -1 }),
    ];

    const result = computeStatus(installed, atts, 'plug-in');
    expect(result[0]!.pkg).toBe('@b/blocked');
    expect(result[1]!.pkg).toBe('@c/warned');
    expect(result[2]!.pkg).toBe('@a/ok');
  });
});

// ── formatStatus ──────────────────────────────────────────────────────────────

describe('formatStatus', () => {
  it('returns a "no installed" message for empty input', () => {
    const out = formatStatus([]);
    expect(out).toMatch(/no installed/i);
  });

  it('shows [ok] for clean entries with endorsements', () => {
    const installed = { '@good/pkg': makeRecord() };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@good/pkg', kind: 'endorse' }),
    ];
    const entries = computeStatus(installed, atts, 'plug-in');
    const out = formatStatus(entries);

    expect(out).toContain('[ok]');
    expect(out).toContain('@good/pkg');
    expect(out).toContain('endorsement');
  });

  it('shows [warn] for entries with warnings', () => {
    const installed = { '@questionable/pkg': makeRecord() };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@questionable/pkg', kind: 'warn', reason: 'dodgy', score: -1 }),
    ];
    const entries = computeStatus(installed, atts, 'plug-in');
    const out = formatStatus(entries);

    expect(out).toContain('[warn]');
    expect(out).toContain('dodgy');
    expect(out).toContain('review');
  });

  it('shows [block] and suggests disable action for blocked entries', () => {
    const installed = { '@bad/pkg': makeRecord() };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@bad/pkg', kind: 'block', reason: 'malware', score: -2 }),
    ];
    const entries = computeStatus(installed, atts, 'plug-in');
    const out = formatStatus(entries);

    expect(out).toContain('[block]');
    expect(out).toContain('malware');
    expect(out).toContain('jinn solver-plugins block @bad/pkg');
  });

  it('uses jinn harnesses verb for harness subjectType', () => {
    const installed = { '@bad/harness': makeRecord() };
    const atts: AttestationWithAttestor[] = [
      makeAtt({ attestor: '0xA', subject: '@bad/harness', kind: 'block', subjectType: 'harness', score: -2 }),
    ];
    const entries = computeStatus(installed, atts, 'harness');
    const out = formatStatus(entries);

    expect(out).toContain('jinn harnesses block @bad/harness');
  });
});
