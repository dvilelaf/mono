/**
 * `jinn solver-plugins add` — content-hash binding integration test.
 *
 * Verifies that running `add` on a local SolverPlugin package writes an
 * InstalledRecord with the three required hashes (manifest, tarball,
 * entry-points) to the installed-plug-ins store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import solverPlugins from '../../src/cli/commands/solver-plugins.js';
import { readInstalledPlugIns } from '../../src/installed-records.js';
import { makeCommandCtx } from '@test/cli.js';

let TMP: string;
let HOME: string;
let PKG_ROOT: string;

beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'jinn-sp-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });

  // Build a minimal valid SolverPlugin package on disk.
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

describe('jinn solver-plugins add — content-hash binding', () => {
  it('records manifest+tarball+entry-point hashes on add', async () => {
    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    // Should exit cleanly (no error exits).
    expect(made.exits).toHaveLength(0);

    // Output should confirm the verb.
    const out = made.writes.join('');
    const parsed = JSON.parse(out.split('\n').find((l) => l.startsWith('{'))!);
    expect(parsed.verb).toBe('solver-plugins add');
    expect(parsed.added.name).toBe('@foo/bar');

    // The install record should be on disk.
    const records = readInstalledPlugIns(HOME);
    expect(records['@foo/bar']).toMatchObject({
      version: '1.2.3',
      manifestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      tarballHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      entryPointHashes: {
        'skills/base-rate/SKILL.md': expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      tier: 1,
      publishedAttestation: null,
    });
  });

  it('errors when the path does not exist', async () => {
    const made = makeCommandCtx({
      argv: ['add', '/nonexistent/path/plugin'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);
    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toContain('not_found');
  });

  it('records empty entryPointHashes when jinn.skills is absent', async () => {
    // Write a plugin without skills.
    writeFileSync(
      join(PKG_ROOT, 'jinn.plugin.json'),
      JSON.stringify({
        name: '@foo/bar',
        version: '1.2.3',
        jinn: { supports: ['prediction.v1'] },
      }),
    );
    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);
    expect(made.exits).toHaveLength(0);
    const records = readInstalledPlugIns(HOME);
    expect(records['@foo/bar']?.entryPointHashes).toEqual({});
  });
});
