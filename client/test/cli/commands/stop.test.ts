import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import stop from '../../../src/cli/commands/stop.js';
import { jinnStop } from '../../../src/cli/commands/stop.js';
import { makeCommandCtx } from '@test/cli.js';
import { Store } from '../../../src/store/store.js';

describe('stop command', () => {
  it('is success-shaped when no pidfile exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-test-'));
    const { ctx, writes, exits } = makeCommandCtx({ env: { JINN_EARNING_DIR: dir } });
    await stop.run(ctx);
    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.state).toBe('stopped');
    expect(parsed.pid).toBeNull();
    expect(parsed.killed).toBe(false);
    expect(exits).toEqual([]);
  });

  it('reads the pidfile and reports the pid on success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-test-'));
    writeFileSync(join(dir, 'daemon.pid'), '99999\n');
    const { ctx, writes } = makeCommandCtx({ env: { JINN_EARNING_DIR: dir } });
    // PID 99999 almost certainly doesn't exist — stop should still emit a
    // success-shaped response with killed=false rather than an envelope.
    await stop.run(ctx);
    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.pid).toBe(99999);
    expect(typeof parsed.killed).toBe('boolean');
  });

  it('removes stale pidfiles and clears persisted running state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-test-'));
    const dbPath = join(dir, 'jinn.db');
    const store = new Store(dbPath);
    try {
      store.setShutdownState('running');
    } finally {
      store.close();
    }
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ dbPath, earningDir: dir }), 'utf8');
    writeFileSync(join(dir, 'daemon.pid'), '99999\n');

    const { ctx, writes } = makeCommandCtx({ argv: ['--config', join(dir, 'config.json')] });
    await stop.run(ctx);

    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      state: 'stopped',
      pid: 99999,
      killed: false,
      pidfileRemoved: true,
      stalePidfileCleaned: true,
    });
    expect(existsSync(join(dir, 'daemon.pid'))).toBe(false);
    const verifyStore = new Store(dbPath);
    try {
      expect(verifyStore.getShutdownState()).toBe('clean');
    } finally {
      verifyStore.close();
    }
  });

  it('emits invalid_invocation for bad flags', async () => {
    const { ctx, writes, exits } = makeCommandCtx({ argv: ['--humna'] });
    await stop.run(ctx);
    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed.code).toBe('invalid_invocation');
    expect(exits).toEqual([11]);
  });

  // ── jinn-mono-hjex.5: port-based discovery ───────────────────────────────

  it('discovers daemon by port when pidfile is missing (jinn-mono-hjex.5)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-hjex5-'));
    const pidfilePath = join(dir, 'daemon.pid');
    // Ensure no pidfile exists.
    expect(existsSync(pidfilePath)).toBe(false);

    const fakeLsof = vi.fn().mockResolvedValue({ pid: 19958, command: 'node', uptimeSeconds: 104400 });
    const result = await jinnStop({ pidfilePath, port: 7331, lsofImpl: fakeLsof, dryRun: true });

    expect(result.schemaVersion).toBe(1);
    // dryRun=true so killed stays false; PID was found via port
    expect(result.pid).toBe(19958);
    expect(result.discoveredVia).toBe('port');
    expect(fakeLsof).toHaveBeenCalledWith(7331);
  });

  it('returns state=stopped and no discoveredVia when lsof finds nothing (jinn-mono-hjex.5)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-hjex5-'));
    const pidfilePath = join(dir, 'daemon.pid');

    const fakeLsof = vi.fn().mockResolvedValue(null);
    const result = await jinnStop({ pidfilePath, port: 7331, lsofImpl: fakeLsof });

    expect(result.state).toBe('stopped');
    expect(result.pid).toBeNull();
    expect(result.discoveredVia).toBeUndefined();
  });

  it('gracefully handles lsof unavailable (jinn-mono-hjex.5)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-hjex5-'));
    const pidfilePath = join(dir, 'daemon.pid');

    const fakeLsof = vi.fn().mockRejectedValue(new Error('lsof not found'));
    const result = await jinnStop({ pidfilePath, port: 7331, lsofImpl: fakeLsof });

    // Should not crash; falls through to "already stopped"
    expect(result.state).toBe('stopped');
    expect(result.pid).toBeNull();
  });

  it('parses setup-halted JSON pidfile and surfaces pidfileMode (jinn-mono-hjex.5)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-hjex5-'));
    const pidfilePath = join(dir, 'daemon.pid');
    // Write a JSON pidfile as main.ts does when halted
    writeFileSync(pidfilePath, JSON.stringify({ pid: 99999, mode: 'setup-halted' }) + '\n');

    const result = await jinnStop({ pidfilePath, port: 7331 });

    expect(result.pid).toBe(99999);
    expect(result.pidfileMode).toBe('setup-halted');
    // PID 99999 doesn't exist so it should be cleaned up as stale
    expect(result.stalePidfileCleaned).toBe(true);
  });

  it('does not fall back to port discovery when pidfile exists (jinn-mono-hjex.5)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jinn-stop-hjex5-'));
    const pidfilePath = join(dir, 'daemon.pid');
    // Write a stale pidfile — process 99999 doesn't exist
    writeFileSync(pidfilePath, '99999\n');

    const fakeLsof = vi.fn().mockResolvedValue({ pid: 12345, command: 'node', uptimeSeconds: 100 });
    const result = await jinnStop({ pidfilePath, port: 7331, lsofImpl: fakeLsof });

    // Should use pidfile path, NOT port discovery
    expect(result.pid).toBe(99999);
    expect(result.discoveredVia).toBeUndefined();
    expect(fakeLsof).not.toHaveBeenCalled();
  });
});
