import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../src/cli/command.js';

const spawnMock = vi.fn();
const stopRunMock = vi.fn();

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: spawnMock,
  };
});

vi.mock('../../src/cli/commands/stop.js', () => ({
  default: {
    name: 'stop',
    summary: '',
    helpText: '',
    run: stopRunMock,
  },
}));

class FakeChildProcess extends EventEmitter {
  pid = 4242;
  unref = vi.fn();
}

describe('operator MCP helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useRealTimers();
  });

  it('returns starting until daemon startup creates a pidfile', async () => {
    vi.useFakeTimers();
    spawnMock.mockReturnValue(new FakeChildProcess());

    const { startDetachedDaemon } = await import('../../src/mcp/operator-server.js');
    const home = mkdtempSync(join(tmpdir(), 'jinn-mcp-start-'));

    const promise = startDetachedDaemon({ HOME: home });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toEqual({
      ok: true,
      payload: { pid: 4242, status: 'starting' },
    });
  });

  it('maps a missing pidfile stop response to not_running', async () => {
    stopRunMock.mockImplementation(async (ctx: CommandContext) => {
      ctx.writer.write(JSON.stringify({
        code: 'invalid_invocation',
        details: { field: 'daemon_pidfile' },
      }));
      ctx.exit(11);
    });

    const { stopDetachedDaemon } = await import('../../src/mcp/operator-server.js');
    const result = await stopDetachedDaemon({});

    expect(result).toEqual({
      ok: true,
      payload: { status: 'not_running' },
    });
  });
});
