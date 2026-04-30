import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPlugIns } from '../../../src/cli/commands/plug-ins.js';

let TMP: string;
let CONFIG: string;

beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'jinn-pi-cli-'));
  CONFIG = join(TMP, 'config.json');
  writeFileSync(CONFIG, JSON.stringify({ learnerPlugIns: [] }, null, 2));
});

function fakePackageDir(name: string): string {
  const d = mkdtempSync(join(tmpdir(), 'jinn-pkg-'));
  writeFileSync(
    join(d, 'package.json'),
    JSON.stringify({ name, version: '0.1.0' }),
  );
  writeFileSync(
    join(d, 'jinn-plugin.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      name,
      version: '0.1.0',
      compatibility: { claudeCodeLearner: '>=0.1.0' },
      slots: [{ type: 'mcp-tool', command: 'node', args: ['server.js'] }],
    }),
  );
  return d;
}

describe('runPlugIns', () => {
  it('add appends an entry to learnerPlugIns', async () => {
    const pkg = fakePackageDir('@example/p');
    const code = await runPlugIns({
      argv: ['add', '@example/p', '--entry', pkg],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    expect(code).toBe(0);
    const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
    expect(cfg.learnerPlugIns).toHaveLength(1);
    expect(cfg.learnerPlugIns[0].name).toBe('@example/p');
  });

  it('add refuses to add a duplicate name', async () => {
    const pkg = fakePackageDir('@example/p');
    await runPlugIns({
      argv: ['add', '@example/p', '--entry', pkg],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    const code = await runPlugIns({
      argv: ['add', '@example/p', '--entry', pkg],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    expect(code).toBe(1);
    const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
    expect(cfg.learnerPlugIns).toHaveLength(1);
  });

  it('add refuses an invalid manifest', async () => {
    const d = mkdtempSync(join(tmpdir(), 'jinn-bad-'));
    writeFileSync(
      join(d, 'package.json'),
      JSON.stringify({ name: '@example/bad', version: '0.1.0' }),
    );
    writeFileSync(join(d, 'jinn-plugin.json'), JSON.stringify({ broken: true }));
    const code = await runPlugIns({
      argv: ['add', '@example/bad', '--entry', d],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    expect(code).toBe(1);
  });

  it('remove deletes the entry', async () => {
    const pkg = fakePackageDir('@example/p');
    await runPlugIns({
      argv: ['add', '@example/p', '--entry', pkg],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    const code = await runPlugIns({
      argv: ['remove', '@example/p'],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    expect(code).toBe(0);
    const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
    expect(cfg.learnerPlugIns).toEqual([]);
  });

  it('list prints installed plug-ins', async () => {
    const pkg = fakePackageDir('@example/p');
    await runPlugIns({
      argv: ['add', '@example/p', '--entry', pkg],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    let captured = '';
    const code = await runPlugIns({
      argv: ['list'],
      configPath: CONFIG,
      stdout: { write: (s: string) => { captured += s; } },
      stderr: { write: () => {} },
    });
    expect(code).toBe(0);
    expect(captured).toContain('@example/p');
  });

  it('show prints the manifest', async () => {
    const pkg = fakePackageDir('@example/p');
    await runPlugIns({
      argv: ['add', '@example/p', '--entry', pkg],
      configPath: CONFIG,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });
    let captured = '';
    const code = await runPlugIns({
      argv: ['show', '@example/p'],
      configPath: CONFIG,
      stdout: { write: (s: string) => { captured += s; } },
      stderr: { write: () => {} },
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(captured);
    expect(parsed.name).toBe('@example/p');
    expect(parsed.version).toBe('0.1.0');
  });
});
