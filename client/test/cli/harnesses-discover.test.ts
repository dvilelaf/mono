/**
 * CLI integration tests for `jinn harnesses discover` and
 * `jinn harnesses status`.
 *
 * Mirror of solver-plugins-discover.test.ts, but for harnesses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCommandCtx } from '@test/cli.js';
import { writeInstalledHarness } from '../../src/installed-records.js';
import type { AttestationWithAttestor } from '../../src/network-trust/most-recent-wins.js';
import type { AttestationFeedbackReader } from '../../src/network-trust/feedback-reader.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

let mockReader: AttestationFeedbackReader;

vi.mock('../../src/network-trust/feedback-reader.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/feedback-reader.js')>();
  return {
    ...orig,
    createNoOpFeedbackReader: () => mockReader,
  };
});

const { default: harnesses } = await import('../../src/cli/commands/harnesses.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

let TMP: string;
let HOME: string;

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harness-disc-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });

  mockReader = {
    async fetchAttestations() { return []; },
    async readAllAttestationsFromAttestors() { return []; },
  };
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

function makeAtt(
  overrides: Partial<AttestationWithAttestor> & Pick<AttestationWithAttestor, 'attestor' | 'subject' | 'kind'>,
): AttestationWithAttestor {
  return {
    subjectType: 'harness',
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

// ── harnesses discover ────────────────────────────────────────────────────────

describe('jinn harnesses discover', () => {
  it('returns empty message when no followed attestors configured', async () => {
    const made = makeCommandCtx({
      argv: ['discover'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toMatch(/no followed.*attestors/i);
  });

  it('lists subjects ranked by endorsement count from followed attestors', async () => {
    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'];

    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return [
          makeAtt({ attestor: followedAttestors[0]!, subject: '@example/forecaster', kind: 'endorse' }),
          makeAtt({ attestor: followedAttestors[1]!, subject: '@example/forecaster', kind: 'endorse' }),
          makeAtt({ attestor: followedAttestors[0]!, subject: '@bad/harness', kind: 'warn', score: -1 }),
        ];
      },
    };

    const made = makeCommandCtx({
      argv: ['discover'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors.join(','),
      },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');

    // @example/forecaster should appear before @bad/harness.
    const goodIdx = out.indexOf('@example/forecaster');
    const badIdx = out.indexOf('@bad/harness');
    expect(goodIdx).toBeGreaterThanOrEqual(0);
    expect(badIdx).toBeGreaterThanOrEqual(0);
    expect(goodIdx).toBeLessThan(badIdx);

    // The add verb should be for harnesses.
    expect(out).toContain('jinn harnesses add @example/forecaster');
  });

  it('shows (not recommended) for subjects with negative net score', async () => {
    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];

    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return [
          makeAtt({ attestor: followedAttestors[0]!, subject: '@bad/harness', kind: 'block', score: -2 }),
        ];
      },
    };

    const made = makeCommandCtx({
      argv: ['discover'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors[0]!,
      },
    });
    await harnesses.run(made.ctx);

    const out = made.writes.join('');
    expect(out).toContain('(not recommended)');
  });
});

// ── harnesses status ──────────────────────────────────────────────────────────

describe('jinn harnesses status', () => {
  it('shows [ok] for clean harnesses with endorsements', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', {
      version: '0.1.0',
      manifestHash: 'sha256:aaa',
      tarballHash: 'sha256:bbb',
      entryPointHashes: {},
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });

    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];
    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return [
          makeAtt({ attestor: followedAttestors[0]!, subject: '@example/forecaster', kind: 'endorse', version: '0.1.0' }),
        ];
      },
    };

    const made = makeCommandCtx({
      argv: ['status'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors[0]!,
      },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('[ok]');
    expect(out).toContain('@example/forecaster');
  });

  it('flags installed harnesses with warnings from followed attestors', async () => {
    writeInstalledHarness(HOME, '@questionable/harness', {
      version: '0.0.1',
      manifestHash: 'sha256:aaa',
      tarballHash: 'sha256:bbb',
      entryPointHashes: {},
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });

    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];
    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return [
          makeAtt({
            attestor: followedAttestors[0]!,
            subject: '@questionable/harness',
            subjectType: 'harness',
            kind: 'warn',
            version: '0.0.1',
            reason: 'memory leak under load',
            score: -1,
          }),
        ];
      },
    };

    const made = makeCommandCtx({
      argv: ['status'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors[0]!,
      },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('[warn]');
    expect(out).toContain('@questionable/harness');
    expect(out).toContain('memory leak under load');
  });

  it('flags installed harnesses with block advisories', async () => {
    writeInstalledHarness(HOME, '@bad/harness', {
      version: '1.0.0',
      manifestHash: 'sha256:aaa',
      tarballHash: 'sha256:bbb',
      entryPointHashes: {},
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });

    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];
    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return [
          makeAtt({
            attestor: followedAttestors[0]!,
            subject: '@bad/harness',
            subjectType: 'harness',
            kind: 'block',
            reason: 'exfiltrates data',
            score: -2,
          }),
        ];
      },
    };

    const made = makeCommandCtx({
      argv: ['status'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors[0]!,
      },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('[block]');
    expect(out).toContain('@bad/harness');
    expect(out).toContain('exfiltrates data');
    expect(out).toContain('jinn harnesses block @bad/harness');
  });

  it('shows advisory notice when no followedAttestors configured', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', {
      version: '0.1.0',
      manifestHash: 'sha256:aaa',
      tarballHash: 'sha256:bbb',
      entryPointHashes: {},
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });

    const made = makeCommandCtx({
      argv: ['status'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toMatch(/no followed.*attestors/i);
  });
});
