/**
 * CLI integration tests for `jinn solver-plugins discover` and
 * `jinn solver-plugins status`.
 *
 * These tests inject a mock `AttestationFeedbackReader` that returns a fixed
 * set of attestations, then assert on rendered stdout. The no-op reader is
 * replaced via vi.mock so the CLI command receives live (mock) data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCommandCtx } from '@test/cli.js';
import { writeInstalledPlugIn } from '../../src/installed-records.js';
import type { AttestationWithAttestor } from '../../src/network-trust/most-recent-wins.js';
import type { AttestationFeedbackReader } from '../../src/network-trust/feedback-reader.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

// We mock the feedback-reader module so `createNoOpFeedbackReader` returns
// our controlled mock reader. The mock is hoisted and configured per-test.

let mockReader: AttestationFeedbackReader;

vi.mock('../../src/network-trust/feedback-reader.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/feedback-reader.js')>();
  return {
    ...orig,
    createNoOpFeedbackReader: () => mockReader,
  };
});

const { default: solverPlugins } = await import('../../src/cli/commands/solver-plugins.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

let TMP: string;
let HOME: string;

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-sp-disc-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });

  // Default: empty reader.
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

// ── discover tests ────────────────────────────────────────────────────────────

describe('jinn solver-plugins discover', () => {
  it('returns empty message when no followed attestors configured', async () => {
    // No JINN_FOLLOWED_ATTESTORS in env.
    const made = makeCommandCtx({
      argv: ['discover'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

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
          makeAtt({ attestor: followedAttestors[0]!, subject: '@foo/bar', kind: 'endorse' }),
          makeAtt({ attestor: followedAttestors[1]!, subject: '@foo/bar', kind: 'endorse' }),
          makeAtt({ attestor: followedAttestors[0]!, subject: '@bad/typo', kind: 'warn', score: -1 }),
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
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');

    // @foo/bar should appear before @bad/typo (higher score).
    const fooIdx = out.indexOf('@foo/bar');
    const badIdx = out.indexOf('@bad/typo');
    expect(fooIdx).toBeGreaterThanOrEqual(0);
    expect(badIdx).toBeGreaterThanOrEqual(0);
    expect(fooIdx).toBeLessThan(badIdx);

    // @foo/bar has 2 endorsements.
    expect(out).toContain('Endorsements');

    // @bad/typo has warnings.
    expect(out).toContain('Warnings');
  });

  it('shows (not recommended) for subjects with negative net score', async () => {
    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];

    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return [
          makeAtt({ attestor: followedAttestors[0]!, subject: '@bad/pkg', kind: 'block', score: -2 }),
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
    await solverPlugins.run(made.ctx);

    const out = made.writes.join('');
    expect(out).toContain('(not recommended)');
  });

  it('respects --limit flag', async () => {
    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];

    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return ['@a/a', '@b/b', '@c/c', '@d/d', '@e/e'].map((subject) =>
          makeAtt({ attestor: followedAttestors[0]!, subject, kind: 'endorse' }),
        );
      },
    };

    const made = makeCommandCtx({
      argv: ['discover', '--limit', '2'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors[0]!,
      },
    });
    await solverPlugins.run(made.ctx);

    const out = made.writes.join('');
    // Should say "and X more".
    expect(out).toMatch(/and \d+ more/i);
  });
});

// ── status tests ──────────────────────────────────────────────────────────────

describe('jinn solver-plugins status', () => {
  it('outputs nothing concerning when all installs have no advisories', async () => {
    writeInstalledPlugIn(HOME, '@good/pkg', {
      version: '1.0.0',
      manifestHash: 'sha256:aaa',
      tarballHash: 'sha256:bbb',
      entryPointHashes: {},
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });

    // reader returns no advisories.
    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];
    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() {
        return [makeAtt({ attestor: followedAttestors[0]!, subject: '@good/pkg', kind: 'endorse' })];
      },
    };

    const made = makeCommandCtx({
      argv: ['status'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors[0]!,
      },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('[ok]');
    expect(out).not.toContain('[block]');
    expect(out).not.toContain('[warn]');
  });

  it('flags installed plug-ins with warnings from followed attestors', async () => {
    writeInstalledPlugIn(HOME, '@questionable/typo', {
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
            subject: '@questionable/typo',
            kind: 'warn',
            version: '0.0.1',
            reason: 'crashes on null input',
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
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('[warn]');
    expect(out).toContain('@questionable/typo');
    expect(out).toContain('crashes on null input');
  });

  it('flags installed plug-ins with block advisories', async () => {
    writeInstalledPlugIn(HOME, '@bad/pkg', {
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
            subject: '@bad/pkg',
            kind: 'block',
            reason: 'confirmed malware',
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
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('[block]');
    expect(out).toContain('@bad/pkg');
    expect(out).toContain('confirmed malware');
    // Should suggest the block action.
    expect(out).toContain('jinn solver-plugins block @bad/pkg');
  });

  it('shows advisory notice when no followedAttestors configured', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', {
      version: '1.0.0',
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
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toMatch(/no followed.*attestors/i);
  });

  it('shows "no installed" message when nothing is installed', async () => {
    const followedAttestors = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'];
    mockReader = {
      async fetchAttestations() { return []; },
      async readAllAttestationsFromAttestors() { return []; },
    };

    const made = makeCommandCtx({
      argv: ['status'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: followedAttestors[0]!,
      },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toMatch(/no installed/i);
  });
});
