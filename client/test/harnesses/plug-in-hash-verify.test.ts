/**
 * Plug-in content-hash verification at session start.
 *
 * Tests that `loadSolverNets` refuses to load a configured plug-in when its
 * install record doesn't match the on-disk content at load time, and succeeds
 * when they match.
 *
 * Note: `resolveSolverPlugin` with `path:` source copies the package to a
 * vendor directory on first load and does not re-copy on subsequent loads.
 * The hash check runs against `plugin.root` (the vendor copy), so we write
 * the install record using hashes of the vendor copy after the first
 * `loadSolverNets` call, or we write a record with deliberately wrong hashes
 * to simulate post-install drift.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSolverNets, ContentHashError } from '../../src/solver-nets/registry.js';
import { writeInstalledPlugIn } from '../../src/installed-records.js';
import { computeManifestHash } from '../../src/harnesses/manifest/content-hash.js';
import { readFileSync } from 'node:fs';

let TMP: string;
let HOME: string;
let PKG_ROOT: string;

// Minimal SolverNet config that includes one user-configured local plugin.
function makeConfig(pluginSource: string) {
  return {
    solverNets: {
      prediction: {
        enabled: true,
        solverType: 'prediction.v1',
        roles: ['evaluating'] as const,
        harness: 'prediction-v1-baseline',
        plugins: [pluginSource],
        taskGenerator: { enabled: false },
      },
    },
  };
}

beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'jinn-hash-verify-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });

  PKG_ROOT = join(TMP, 'my-plugin');
  mkdirSync(join(PKG_ROOT, 'skills', 'base-rate'), { recursive: true });
  writeFileSync(join(PKG_ROOT, 'skills', 'base-rate', 'SKILL.md'), '# Base Rate v1');
  writeFileSync(
    join(PKG_ROOT, 'jinn.plugin.json'),
    JSON.stringify({
      name: '@example/prediction-plugin',
      version: '1.0.0',
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

describe('loadSolverNets — plug-in content-hash verification', () => {
  it('succeeds when install record matches on-disk content', async () => {
    // First load: materialises the vendor copy and gives us the real root.
    // We must write a correct install record keyed to the vendor root.
    // To do that, we temporarily write a record with the correct hashes from PKG_ROOT
    // (before first load, vendor copy doesn't exist).
    const manifest = JSON.parse(
      readFileSync(join(PKG_ROOT, 'jinn.plugin.json'), 'utf-8'),
    ) as object;
    const {
      computeTarballHash,
      computeEntryPointHashes,
    } = await import('../../src/harnesses/manifest/content-hash.js');
    const skills: string[] = (manifest as { jinn: { skills?: string[] } }).jinn.skills ?? [];
    writeInstalledPlugIn(HOME, '@example/prediction-plugin', {
      version: '1.0.0',
      manifestHash: computeManifestHash(manifest),
      tarballHash: computeTarballHash(PKG_ROOT),
      entryPointHashes: computeEntryPointHashes(PKG_ROOT, skills),
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });

    // The vendor copy is a byte-for-byte copy of PKG_ROOT, so hashes match.
    const registry = await loadSolverNets(
      makeConfig(`path:${PKG_ROOT}`),
      { home: HOME },
    );
    const net = registry.forSolverType('prediction.v1', 'evaluation');
    const userPlugin = net?.runtimePlugins.find(
      (p) => p.name === '@example/prediction-plugin',
    );
    expect(userPlugin).toBeDefined();
  });

  it('throws ContentHashError when there is no install record', async () => {
    // Don't write any record — loadSolverNets should throw.
    await expect(
      loadSolverNets(makeConfig(`path:${PKG_ROOT}`), { home: HOME }),
    ).rejects.toThrow(ContentHashError);
    await expect(
      loadSolverNets(makeConfig(`path:${PKG_ROOT}`), { home: HOME }),
    ).rejects.toThrow(/no install record/);
  });

  it('throws ContentHashError when the manifest hash in the record does not match', async () => {
    // Write a record with a wrong manifest hash to simulate post-install drift.
    writeInstalledPlugIn(HOME, '@example/prediction-plugin', {
      version: '1.0.0',
      manifestHash: 'sha256:' + 'a'.repeat(64), // wrong hash
      tarballHash: 'sha256:' + 'b'.repeat(64),
      entryPointHashes: {},
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });
    await expect(
      loadSolverNets(makeConfig(`path:${PKG_ROOT}`), { home: HOME }),
    ).rejects.toThrow(ContentHashError);
    await expect(
      loadSolverNets(makeConfig(`path:${PKG_ROOT}`), { home: HOME }),
    ).rejects.toThrow(/manifest changed/);
  });

  it('throws ContentHashError naming the changed file when an entry-point hash mismatches', async () => {
    // Write an install record where the manifest hash is correct but an
    // entry-point hash is wrong (simulating post-install mutation of the skill).
    const manifest = JSON.parse(
      readFileSync(join(PKG_ROOT, 'jinn.plugin.json'), 'utf-8'),
    ) as object;
    writeInstalledPlugIn(HOME, '@example/prediction-plugin', {
      version: '1.0.0',
      manifestHash: computeManifestHash(manifest),
      tarballHash: 'sha256:' + 'b'.repeat(64),
      entryPointHashes: {
        'skills/base-rate/SKILL.md': 'sha256:' + 'c'.repeat(64), // wrong
      },
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });
    await expect(
      loadSolverNets(makeConfig(`path:${PKG_ROOT}`), { home: HOME }),
    ).rejects.toThrow(ContentHashError);
    await expect(
      loadSolverNets(makeConfig(`path:${PKG_ROOT}`), { home: HOME }),
    ).rejects.toThrow('skills/base-rate/SKILL.md');
  });

  it('does NOT verify bundled (default) plugins', async () => {
    // No install record for the bundled plugins — they should still load fine.
    const registry = await loadSolverNets(
      {
        solverNets: {
          prediction: {
            enabled: true,
            solverType: 'prediction.v1',
            roles: ['evaluating'],
            harness: 'prediction-v1-baseline',
            plugins: [], // no user plugins
            taskGenerator: { enabled: false },
          },
        },
      },
      { home: HOME },
    );
    const net = registry.forSolverType('prediction.v1', 'evaluation');
    expect(net?.runtimePlugins.length).toBeGreaterThan(0);
  });
});
