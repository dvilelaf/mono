import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import harnesses from '../../src/cli/commands/harnesses.js';
import { makeCommandCtx } from '@test/cli.js';

let TMP: string;
let CONFIG_PATH: string;

beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'cli-mode-'));
  CONFIG_PATH = join(TMP, 'config.json');
  writeFileSync(CONFIG_PATH, JSON.stringify({ network: 'testnet' }));
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
}

describe('jinn harness mode', () => {
  it('writes mode = "frozen" to config', async () => {
    const made = makeCommandCtx({ argv: ['mode', 'frozen', '--config', CONFIG_PATH, '--json'] });
    await harnesses.run(made.ctx);
    const config = readConfig();
    expect((config.harness as any)?.mode).toBe('frozen');
  });

  it('writes mode = "train" to config', async () => {
    const made = makeCommandCtx({ argv: ['mode', 'train', '--config', CONFIG_PATH, '--json'] });
    await harnesses.run(made.ctx);
    const config = readConfig();
    expect((config.harness as any)?.mode).toBe('train');
  });

  it('rejects invalid mode arguments', async () => {
    const made = makeCommandCtx({
      argv: ['mode', 'eval', '--config', CONFIG_PATH, '--json'],
    });
    await harnesses.run(made.ctx);
    expect(made.exits).toContain(1);
  });
});

describe('jinn harness status', () => {
  it('prints current mode', async () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ harness: { mode: 'frozen' } }));
    const made = makeCommandCtx({ argv: ['status', '--config', CONFIG_PATH] });
    await harnesses.run(made.ctx);
    const output = made.writes.join('');
    expect(output).toContain('mode: frozen');
  });

  it('prints default mode when not configured', async () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({}));
    const made = makeCommandCtx({ argv: ['status', '--config', CONFIG_PATH] });
    await harnesses.run(made.ctx);
    const output = made.writes.join('');
    expect(output).toContain('mode: train');
  });
});
