/**
 * Integration tests for executeBashWithFilter.
 *
 * Verifies that the filter is wired into actual execution: refused commands are
 * logged to workingDir/.bash/refused.jsonl and are never executed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeBashWithFilter } from '../../src/runner/bash-executor.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'jinn-bash-filter-test-'));
}

const tempDirs: string[] = [];

function newWorkingDir(): string {
  const d = makeTempDir();
  tempDirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of tempDirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('executeBashWithFilter — refusals', () => {
  it('refuses yarn add and writes refused.jsonl', async () => {
    const workingDir = newWorkingDir();
    const result = await executeBashWithFilter('yarn add @foo/bar', workingDir);

    expect(result.exitCode).toBe(1);
    expect(result.refusal).toBeDefined();
    expect(result.refusal!.rule).toBe('yarn-add');
    expect(result.stderr).toContain('Refused');

    const logPath = join(workingDir, '.bash', 'refused.jsonl');
    expect(existsSync(logPath)).toBe(true);

    const lines = readFileSync(logPath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]!) as { ts: string; command: string; rule: string };
    expect(entry.command).toBe('yarn add @foo/bar');
    expect(entry.rule).toBe('yarn-add');
    expect(entry.ts).toBeTruthy();
  });

  it('refuses npm install and logs to same file', async () => {
    const workingDir = newWorkingDir();
    await executeBashWithFilter('npm install @foo/bar', workingDir);
    await executeBashWithFilter('pnpm add some-pkg', workingDir);

    const logPath = join(workingDir, '.bash', 'refused.jsonl');
    const lines = readFileSync(logPath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!) as { rule: string };
    const second = JSON.parse(lines[1]!) as { rule: string };
    expect(first.rule).toBe('npm-install-pkg');
    expect(second.rule).toBe('pnpm-install-pkg');
  });

  it('refuses jinn solver-plugins add', async () => {
    const workingDir = newWorkingDir();
    const result = await executeBashWithFilter('jinn solver-plugins add @bad/plugin', workingDir);
    expect(result.refusal?.rule).toBe('jinn-install');
    expect(existsSync(join(workingDir, '.bash', 'refused.jsonl'))).toBe(true);
  });

  it('does NOT execute the refused command', async () => {
    const workingDir = newWorkingDir();
    // If the command executed it would create a file; ensure it does not
    const sentinelPath = join(workingDir, 'sentinel');
    const result = await executeBashWithFilter(`yarn add @foo/bar && touch ${sentinelPath}`, workingDir);
    expect(result.refusal).toBeDefined();
    expect(existsSync(sentinelPath)).toBe(false);
  });
});

describe('executeBashWithFilter — allowed commands', () => {
  it('executes safe commands and returns output', async () => {
    const workingDir = newWorkingDir();
    const result = await executeBashWithFilter('echo hello', workingDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.refusal).toBeUndefined();
  });

  it('does not create refused.jsonl for allowed commands', async () => {
    const workingDir = newWorkingDir();
    await executeBashWithFilter('echo safe', workingDir);
    expect(existsSync(join(workingDir, '.bash', 'refused.jsonl'))).toBe(false);
  });

  it('returns non-zero exit code for failing commands', async () => {
    const workingDir = newWorkingDir();
    const result = await executeBashWithFilter('exit 42', workingDir);
    expect(result.exitCode).not.toBe(0);
    expect(result.refusal).toBeUndefined();
  });
});
