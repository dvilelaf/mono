import { describe, expect, it } from 'vitest';
import doctor from '../../../src/cli/commands/doctor.js';
import type { CommandContext } from '../../../src/cli/command.js';

function makeCtx(env: Record<string, string> = {}): {
  ctx: CommandContext; writes: string[]; exits: number[];
} {
  const writes: string[] = [];
  const exits: number[] = [];
  const ctx: CommandContext = {
    argv: [],
    stdoutIsTty: false,
    writer: { write: (s: string) => { writes.push(s); return true; } },
    exit: (code: number) => { exits.push(code); },
    env,
  };
  return { ctx, writes, exits };
}

describe('doctor command', () => {
  it('emits a checks array and an ok/blockingCount roll-up', async () => {
    const { ctx, writes } = makeCtx();
    await doctor.run(ctx);
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]);
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks.length).toBeGreaterThan(0);
    expect(typeof parsed.ok).toBe('boolean');
    expect(typeof parsed.blockingCount).toBe('number');
    // Every check has the required shape
    for (const check of parsed.checks) {
      expect(typeof check.name).toBe('string');
      expect(typeof check.ok).toBe('boolean');
      expect(typeof check.detail).toBe('string');
    }
  });

  it('includes the claude_binary check', async () => {
    const { ctx, writes } = makeCtx();
    await doctor.run(ctx);
    const parsed = JSON.parse(writes[0]);
    const names = parsed.checks.map((c: { name: string }) => c.name);
    expect(names).toContain('claude_binary');
    expect(names).toContain('node_version');
    expect(names).toContain('keystore_present');
  });

  it('reports keystore_present once jinn init has written the keystore', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmp = mkdtempSync(join(tmpdir(), 'jinn-doctor-'));
    writeFileSync(join(tmp, 'master_keystore.json'), '{}');
    const { ctx, writes } = makeCtx({ JINN_EARNING_DIR: tmp });
    await doctor.run(ctx);
    const parsed = JSON.parse(writes[0]);
    const keystoreCheck = parsed.checks.find(
      (c: { name: string }) => c.name === 'keystore_present',
    );
    expect(keystoreCheck).toBeDefined();
    expect(keystoreCheck.ok).toBe(true);
    expect(keystoreCheck.detail).toMatch(/master_keystore\.json/);
  });

  it('--human output is a checklist (not JSON)', async () => {
    const { ctx, writes } = makeCtx();
    ctx.argv = ['--human'];
    await doctor.run(ctx);
    const out = writes.join('');
    expect(out.startsWith('[ok  ]') || out.startsWith('[fail]')).toBe(true);
    expect(out).toMatch(/Summary: /);
  });

  it('includes the claude_auth check', async () => {
    const { ctx, writes } = makeCtx();
    await doctor.run(ctx);
    const parsed = JSON.parse(writes[0]);
    const names = parsed.checks.map((c: { name: string }) => c.name);
    expect(names).toContain('claude_auth');
  });

  it('emits invalid_invocation for bad flags', async () => {
    const { ctx, writes, exits } = makeCtx();
    ctx.argv = ['--bogus'];
    await doctor.run(ctx);
    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed.code).toBe('invalid_invocation');
    expect(exits).toEqual([11]);
  });
});
