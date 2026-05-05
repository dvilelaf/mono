/**
 * `jinn solver-plugins add` — abridged install reminder (Task 8.3).
 *
 * Verifies that after a successful add, the abridged disclaimer reminder
 * is printed. Also verifies it prints when --publish is used.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCommandCtx } from '@test/cli.js';
import { ABRIDGED_DISCLAIMER } from '../../src/network-trust/disclaimer.js';

// Mock publishAttestation before importing the command.
const mockPublishAttestation = vi.fn();
vi.mock('../../src/network-trust/attestation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/attestation.js')>();
  return {
    ...orig,
    publishAttestation: mockPublishAttestation,
  };
});

const { default: solverPlugins } = await import('../../src/cli/commands/solver-plugins.js');

let TMP: string;
let HOME: string;
let PKG_ROOT: string;

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-sp-reminder-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });

  PKG_ROOT = join(TMP, 'my-plugin');
  mkdirSync(join(PKG_ROOT, 'skills', 'base-rate'), { recursive: true });
  writeFileSync(join(PKG_ROOT, 'skills', 'base-rate', 'SKILL.md'), '# Base Rate');
  writeFileSync(
    join(PKG_ROOT, 'jinn.plugin.json'),
    JSON.stringify({
      name: '@foo/bar',
      version: '1.2.3',
      description: 'Test plugin',
      jinn: {
        supports: ['prediction.v1'],
        skills: ['skills/base-rate/SKILL.md'],
      },
    }),
  );
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn solver-plugins add — abridged install reminder', () => {
  it('prints abridged install reminder after successful add', async () => {
    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const combined = made.writes.join('');
    expect(combined).toContain('Reminder: Jinn does not audit third-party code');
    expect(combined).toContain(ABRIDGED_DISCLAIMER.slice(0, 40));
  });

  it('still prints reminder when --publish is used', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash', cid: 'QmAtt' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--publish'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const combined = made.writes.join('');
    expect(combined).toContain('Reminder: Jinn does not audit third-party code');
  });

  it('does NOT print reminder when add fails', async () => {
    const made = makeCommandCtx({
      argv: ['add', '/nonexistent/path/plugin'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toContain(1);
    const combined = made.writes.join('');
    expect(combined).not.toContain('Reminder: Jinn does not audit');
  });
});
