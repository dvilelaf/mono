/**
 * Tests for the claude-code-learner PreToolUse Bash hook.
 *
 * Covers two paths:
 *   1. The hook script as a subprocess (black-box integration).
 *   2. The bash-filter.ts module directly (unit, always runnable).
 *
 * The subprocess tests require the hook script to be executable. They are
 * skipped automatically on any platform where `node` cannot execute the
 * script (e.g. Windows without WSL). On macOS/Linux they must be green.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, afterEach } from 'vitest';
import { isPackageInstallCommand } from '../../src/runner/bash-filter.js';

const hookPath = fileURLToPath(
  new URL('../../plugins/claude-code-learner/hooks/pre-tool-use-bash', import.meta.url),
);

const bashPayload = (command: string) =>
  JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

// ── Unit tests against bash-filter.ts ────────────────────────────────────────

describe('isPackageInstallCommand', () => {
  it('blocks yarn add', () => {
    const r = isPackageInstallCommand('yarn add @foo/bar');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('yarn-add');
  });

  it('blocks yarn global add', () => {
    const r = isPackageInstallCommand('yarn global add typescript');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('yarn-add');
  });

  it('blocks yarn install <package>', () => {
    const r = isPackageInstallCommand('yarn install some-pkg');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('yarn-add');
  });

  it('does NOT block bare yarn install (no package arg)', () => {
    const r = isPackageInstallCommand('yarn install');
    expect(r.blocked).toBe(false);
  });

  it('does NOT block yarn test', () => {
    const r = isPackageInstallCommand('yarn test');
    expect(r.blocked).toBe(false);
  });

  it('does NOT block yarn build', () => {
    const r = isPackageInstallCommand('yarn build');
    expect(r.blocked).toBe(false);
  });

  it('blocks npm install <package>', () => {
    const r = isPackageInstallCommand('npm install lodash');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('npm-install-pkg');
  });

  it('blocks npm i <package>', () => {
    const r = isPackageInstallCommand('npm i express');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('npm-install-pkg');
  });

  it('does NOT block bare npm install', () => {
    const r = isPackageInstallCommand('npm install');
    expect(r.blocked).toBe(false);
  });

  it('blocks pnpm add', () => {
    const r = isPackageInstallCommand('pnpm add vite');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('pnpm-add');
  });

  it('blocks jinn plug-ins add', () => {
    const r = isPackageInstallCommand('jinn plug-ins add @some-builder/calibration-refiner');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('jinn-plugin-add');
  });

  it('blocks jinn harnesses add', () => {
    const r = isPackageInstallCommand('jinn harnesses add @some-builder/my-harness');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('jinn-plugin-add');
  });

  it('blocks curl to npmjs registry', () => {
    const r = isPackageInstallCommand('curl https://registry.npmjs.org/@foo/bar');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('npm-registry-curl');
  });

  it('blocks direct npmjs.org URL in command', () => {
    const r = isPackageInstallCommand('node -e "fetch(\'https://registry.npmjs.org/foo\')"');
    expect(r.blocked).toBe(true);
    expect(r.rule).toBe('npm-registry-api');
  });

  it('does NOT block unrelated commands', () => {
    const safe = [
      'ls -la',
      'git status',
      'echo hello',
      'node index.js',
      'yarn test --reporter=verbose',
      'yarn build',
      'yarn typecheck',
      'cd /tmp && ls',
    ];
    for (const cmd of safe) {
      const r = isPackageInstallCommand(cmd);
      expect(r.blocked, `Expected "${cmd}" to be allowed`).toBe(false);
    }
  });
});

// ── Subprocess / hook integration tests ──────────────────────────────────────

describe('pre-tool-use-bash hook script', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists and is executable', () => {
    expect(existsSync(hookPath)).toBe(true);
    // A quick exec-bit check: attempt to spawn it with --help-like stdin
    const r = spawnSync(process.execPath, [hookPath], {
      input: '{}',
      encoding: 'utf8',
      timeout: 5000,
    });
    // Should exit 0 (passthrough on unknown tool_name / missing command)
    expect(r.status).toBe(0);
  });

  it('denies yarn add — exits 0, stdout has {"continue":false}', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'jinn-hook-test-'));
    tmpDirs.push(projectDir);

    const r = spawnSync(process.execPath, [hookPath], {
      input: bashPayload('yarn add @foo/bar'),
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"continue":false');

    const parsed = JSON.parse(r.stdout) as { continue: boolean; stopReason: string };
    expect(parsed.continue).toBe(false);
    expect(typeof parsed.stopReason).toBe('string');
    expect(parsed.stopReason.length).toBeGreaterThan(0);

    // Refusal log should have been written
    const refusalLog = join(projectDir, '.bash', 'refused.jsonl');
    expect(existsSync(refusalLog)).toBe(true);
    const lines = readFileSync(refusalLog, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as { ts: string; command: string; rule: string };
    expect(entry.command).toBe('yarn add @foo/bar');
    expect(entry.rule).toBe('yarn-add');
    expect(typeof entry.ts).toBe('string');
  });

  it('passes through yarn test — exits 0, stdout is empty', () => {
    const r = spawnSync(process.execPath, [hookPath], {
      input: bashPayload('yarn test'),
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('passes through non-Bash tool — exits 0, stdout is empty', () => {
    const payload = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/tmp/foo' } });
    const r = spawnSync(process.execPath, [hookPath], {
      input: payload,
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('passes through when command field is missing — exits 0, stdout is empty', () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: {} });
    const r = spawnSync(process.execPath, [hookPath], {
      input: payload,
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('does NOT write a refusal log when command is allowed', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'jinn-hook-passthru-'));
    tmpDirs.push(projectDir);

    const r = spawnSync(process.execPath, [hookPath], {
      input: bashPayload('yarn test'),
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });

    expect(r.status).toBe(0);
    expect(existsSync(join(projectDir, '.bash', 'refused.jsonl'))).toBe(false);
  });
});
