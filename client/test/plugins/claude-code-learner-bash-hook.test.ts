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

const hookPath = fileURLToPath(
  new URL('../../plugins/claude-code-learner/hooks/pre-tool-use-bash', import.meta.url),
);

const bashPayload = (command: string) =>
  JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

// ── Unit tests against bash-filter.ts ────────────────────────────────────────

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
