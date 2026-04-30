import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPlugInManifest } from '../../../src/restorer/plug-ins/manifest.js';

function makePkg(manifest: unknown, pkgName = '@x/p'): string {
  const dir = mkdtempSync(join(tmpdir(), 'jinn-pi-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: pkgName, version: '0.1.0' }),
  );
  writeFileSync(join(dir, 'jinn-plugin.json'), JSON.stringify(manifest));
  return dir;
}

describe('loadPlugInManifest', () => {
  it('parses + validates a phase-agent-override manifest', async () => {
    const pkg = makePkg({
      schemaVersion: '1.0.0',
      name: '@x/p',
      version: '0.1.0',
      compatibility: { claudeCodeLearner: '>=0.1.0', supportedKinds: ['prediction.v0'] },
      slots: [
        {
          type: 'phase-agent-override',
          phase: 'execute',
          agent: 'step-worker',
          entry: 'agents/calibration.md',
          scope: { matchKinds: ['prediction.v0'] },
        },
      ],
    });
    mkdirSync(join(pkg, 'agents'), { recursive: true });
    writeFileSync(join(pkg, 'agents', 'calibration.md'), '---\nname: calibration\n---\n# stub');
    const m = await loadPlugInManifest(pkg);
    expect(m.name).toBe('@x/p');
    expect(m.slots).toHaveLength(1);
  });

  it('rejects a manifest where name disagrees with package.json', async () => {
    const pkg = makePkg(
      {
        schemaVersion: '1.0.0',
        name: '@x/wrong-name',
        version: '0.1.0',
        compatibility: { claudeCodeLearner: '>=0.1.0' },
        slots: [{ type: 'mcp-tool', command: 'node', args: ['server.js'] }],
      },
      '@x/p',
    );
    await expect(loadPlugInManifest(pkg)).rejects.toThrow(/name mismatch/i);
  });

  it('rejects a manifest where slot entry does not exist', async () => {
    const pkg = makePkg({
      schemaVersion: '1.0.0',
      name: '@x/p',
      version: '0.1.0',
      compatibility: { claudeCodeLearner: '>=0.1.0' },
      slots: [
        {
          type: 'phase-agent-override',
          phase: 'execute',
          agent: 'step-worker',
          entry: 'agents/missing.md',
        },
      ],
    });
    await expect(loadPlugInManifest(pkg)).rejects.toThrow(/entry not found/i);
  });

  it('rejects a manifest violating the JSON schema', async () => {
    const pkg = makePkg({
      schemaVersion: '1.0.0',
      name: '@x/p',
      version: 'not-a-semver',
      compatibility: { claudeCodeLearner: '>=0.1.0' },
      slots: [{ type: 'mcp-tool', command: 'x', args: [] }],
    });
    await expect(loadPlugInManifest(pkg)).rejects.toThrow(/schema/i);
  });
});
