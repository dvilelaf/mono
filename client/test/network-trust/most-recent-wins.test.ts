import { describe, it, expect } from 'vitest';
import { resolveCurrentVerdict, type AttestationWithAttestor } from '../../src/network-trust/most-recent-wins.js';

const baseAtt = {
  subject: '@foo/bar',
  subjectType: 'plug-in' as const,
  version: '1.0.0',
  manifestHash: 'sha256:' + 'a'.repeat(64),
  tarballHash: 'sha256:' + 'b'.repeat(64),
  tier: 1 as const,
  reason: '',
  reviewCid: '',
};

describe('resolveCurrentVerdict', () => {
  it('returns the latest attestation per (attestor, subject, version)', () => {
    const atts: AttestationWithAttestor[] = [
      { ...baseAtt, attestor: '0xA', kind: 'endorse', score: 1, attestedAt: 100 },
      { ...baseAtt, attestor: '0xA', kind: 'block',   score: -2, attestedAt: 200 },
      { ...baseAtt, attestor: '0xB', kind: 'endorse', score: 1, attestedAt: 150 },
    ];
    const verdicts = resolveCurrentVerdict(atts);
    expect(verdicts).toHaveLength(2);
    expect(verdicts.find((v) => v.attestor === '0xA')!.kind).toBe('block');
    expect(verdicts.find((v) => v.attestor === '0xB')!.kind).toBe('endorse');
  });

  it('keys per (attestor, subject, version), so different versions stand alone', () => {
    const atts: AttestationWithAttestor[] = [
      { ...baseAtt, attestor: '0xA', version: '1.0.0', kind: 'endorse', score: 1, attestedAt: 100 },
      { ...baseAtt, attestor: '0xA', version: '2.0.0', kind: 'block',   score: -2, attestedAt: 50 },
    ];
    const verdicts = resolveCurrentVerdict(atts);
    expect(verdicts).toHaveLength(2);
  });

  it('returns empty for empty input', () => {
    expect(resolveCurrentVerdict([])).toEqual([]);
  });

  it('handles a single attestation', () => {
    const a: AttestationWithAttestor = {
      ...baseAtt, attestor: '0xA', kind: 'endorse', score: 1, attestedAt: 100,
    };
    expect(resolveCurrentVerdict([a])).toEqual([a]);
  });
});
