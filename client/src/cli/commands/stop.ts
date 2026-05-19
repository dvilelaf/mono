import { parseArgs } from 'node:util';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandContext, CommandModule } from '../command.js';
import { emitResult } from '../output.js';
import { emitEnvelope } from '../../errors/envelope.js';
import { loadConfig } from '../../config.js';
import { Store } from '../../store/store.js';
import type { PortHolder } from '../../preflight/port-pid.js';
import { defaultPortPidLookup } from '../../preflight/port-pid.js';

export interface StopResult {
  schemaVersion: 1;
  generatedAt: string;
  state: 'stopped' | 'stopping';
  pid: number | null;
  killed: boolean;
  pidfilePath: string;
  pidfileRemoved: boolean;
  stalePidfileCleaned: boolean;
  /** Set when we found the daemon via port discovery (no pidfile). */
  discoveredVia?: 'port';
  /** Pidfile mode discriminator, e.g. 'setup-halted' for a halted bootstrap. */
  pidfileMode?: string | null;
  /** Set true when we awaited exit and the process actually exited within the deadline. */
  exited?: boolean;
  /** Set true when SIGTERM did not bring the process down and we escalated to SIGKILL. */
  escalatedToSigkill?: boolean;
}

export type PortPidLookupFn = (port: number) => Promise<PortHolder | null>;

export interface JinnStopOptions {
  pidfilePath: string;
  port?: number;
  dbPath?: string;
  lsofImpl?: PortPidLookupFn;
  /** Skip SIGTERM and just report state (used by jinn update for pre-flight check). */
  dryRun?: boolean;
  /**
   * Poll `processAlive(pid)` after dispatching SIGTERM until the process exits or
   * the deadline elapses. Required by callers (e.g. `jinn update`) that must not
   * race a subsequent action against the running daemon — the SIGTERM handler in
   * `main.ts` is async (closes API server, flushes SQLite) and takes time.
   * Default: false.
   */
  waitForExit?: boolean;
  /** Override the wait-for-exit deadline in ms. Default: 10_000. */
  waitForExitTimeoutMs?: number;
  /**
   * When set, after `waitForExit` exhausts the deadline without the process
   * exiting, escalate to SIGKILL. Default: false. Implies `waitForExit`.
   */
  force?: boolean;
}

/** Exported so callers (e.g. `jinn update`) can poll for exit themselves. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid: number, deadlineMs: number): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !processAlive(pid);
}

/**
 * Parse a pidfile that may be either:
 *   - A plain integer string: "12345\n"   (running mode)
 *   - A JSON object: {"pid":12345,"mode":"setup-halted"}  (halted setup mode)
 *
 * Returns `{ pid, mode }` or `{ pid: null, mode: null }` on parse failure.
 */
function parsePidfile(raw: string): { pid: number | null; mode: string | null } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as { pid?: unknown; mode?: unknown };
      const pid = typeof obj.pid === 'number' && Number.isFinite(obj.pid) ? obj.pid : null;
      const mode = typeof obj.mode === 'string' ? obj.mode : null;
      return { pid, mode };
    } catch {
      return { pid: null, mode: null };
    }
  }
  const n = parseInt(trimmed, 10);
  return { pid: Number.isFinite(n) ? n : null, mode: null };
}

function markShutdownClean(dbPath: string | undefined): void {
  if (!dbPath || !existsSync(dbPath)) return;
  const store = new Store(dbPath);
  try {
    store.setShutdownState('clean');
  } finally {
    store.close();
  }
}

function removePidfile(path: string): boolean {
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Core stop logic, exposed for programmatic use (e.g. `jinn update`).
 *
 * Resolution order:
 *   1. Read pidfile at `pidfilePath` — use if present and valid.
 *   2. If pidfile absent/stale and `port` is provided, call `lsofImpl` to
 *      find the holder by port. Sets `discoveredVia: 'port'` on the result.
 *   3. If nothing found, return `state: 'stopped'`.
 */
export async function jinnStop(opts: JinnStopOptions): Promise<StopResult> {
  const {
    pidfilePath,
    port,
    dbPath,
    lsofImpl = defaultPortPidLookup,
    dryRun = false,
    force = false,
    waitForExit = force,
    waitForExitTimeoutMs = 10_000,
  } = opts;
  const now = () => new Date().toISOString();

  // ── Path A: pidfile exists ────────────────────────────────────────────────
  if (existsSync(pidfilePath)) {
    const { pid, mode: pidfileMode } = parsePidfile(readFileSync(pidfilePath, 'utf-8'));
    let killed = false;
    let stalePidfileCleaned = false;
    let pidfileRemoved = false;
    let exited = false;
    let escalatedToSigkill = false;

    if (pid !== null && processAlive(pid)) {
      if (!dryRun) {
        try {
          process.kill(pid, 'SIGTERM');
          killed = true;
        } catch {
          // Race: process exited between our check and kill — treat as stale.
          stalePidfileCleaned = true;
          pidfileRemoved = removePidfile(pidfilePath);
          markShutdownClean(dbPath);
        }

        // Wait for the SIGTERM handler to actually run — main.ts shuts the
        // API server, flushes SQLite, then exits, which on a loaded node can
        // take a few seconds. Callers that swap the binary (jinn update) MUST
        // await exit, otherwise they race the running daemon.
        if (killed && waitForExit) {
          exited = await waitForProcessExit(pid, waitForExitTimeoutMs);
          if (!exited && force) {
            try {
              process.kill(pid, 'SIGKILL');
              escalatedToSigkill = true;
              exited = await waitForProcessExit(pid, 2_000);
            } catch {
              /* process exited between SIGTERM and SIGKILL */
              exited = !processAlive(pid);
            }
          }
        }
      }
    } else {
      // PID is null or process is gone — stale pidfile.
      stalePidfileCleaned = true;
      pidfileRemoved = removePidfile(pidfilePath);
      markShutdownClean(dbPath);
    }

    return {
      schemaVersion: 1,
      generatedAt: now(),
      state: killed && !exited ? 'stopping' : pid !== null && processAlive(pid) ? 'stopping' : 'stopped',
      pid,
      killed,
      pidfilePath,
      pidfileRemoved,
      stalePidfileCleaned,
      pidfileMode,
      ...(killed && waitForExit ? { exited } : {}),
      ...(escalatedToSigkill ? { escalatedToSigkill: true } : {}),
    };
  }

  // ── Path B: no pidfile — try port discovery ───────────────────────────────
  if (port !== undefined) {
    let holder: PortHolder | null = null;
    try {
      holder = await lsofImpl(port);
    } catch {
      /* lsof unavailable — fall through to "already stopped" */
    }

    if (holder !== null) {
      let killed = false;
      let exited = false;
      let escalatedToSigkill = false;
      if (!dryRun) {
        try {
          process.kill(holder.pid, 'SIGTERM');
          killed = true;
        } catch {
          /* process gone by the time we tried to kill it */
        }

        if (killed && waitForExit) {
          exited = await waitForProcessExit(holder.pid, waitForExitTimeoutMs);
          if (!exited && force) {
            try {
              process.kill(holder.pid, 'SIGKILL');
              escalatedToSigkill = true;
              exited = await waitForProcessExit(holder.pid, 2_000);
            } catch {
              exited = !processAlive(holder.pid);
            }
          }
        }
      }
      markShutdownClean(dbPath);
      return {
        schemaVersion: 1,
        generatedAt: now(),
        state: killed && !exited ? 'stopping' : processAlive(holder.pid) ? 'stopping' : 'stopped',
        pid: holder.pid,
        killed,
        pidfilePath,
        pidfileRemoved: false,
        stalePidfileCleaned: false,
        discoveredVia: 'port',
        ...(killed && waitForExit ? { exited } : {}),
        ...(escalatedToSigkill ? { escalatedToSigkill: true } : {}),
      };
    }
  }

  // ── Path C: nothing found ─────────────────────────────────────────────────
  markShutdownClean(dbPath);
  return {
    schemaVersion: 1,
    generatedAt: now(),
    state: 'stopped',
    pid: null,
    killed: false,
    pidfilePath,
    pidfileRemoved: false,
    stalePidfileCleaned: false,
  };
}

async function run(ctx: CommandContext): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: ctx.argv,
      options: {
        json: { type: 'boolean', default: false },
        human: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        config: { type: 'string' },
      },
      allowPositionals: false,
    });
  } catch (err) {
    emitEnvelope(
      {
        code: 'invalid_invocation',
        message: err instanceof Error ? err.message : String(err),
        exampleCli: 'jinn stop',
        details: { field: 'flags' },
      },
      { writer: ctx.writer, exit: ctx.exit },
    );
    return;
  }
  let config;
  try {
    if (parsed.values.config || (!ctx.env['JINN_EARNING_DIR'] && !ctx.env['JINN_DB_PATH'])) {
      config = loadConfig(parsed.values.config);
    }
  } catch (err) {
    if (parsed.values.config) {
      emitEnvelope(
        {
          code: 'invalid_invocation',
          message: err instanceof Error ? err.message : String(err),
          exampleCli: 'jinn stop --config ~/.jinn-client/config.json',
          details: { field: 'config' },
        },
        { writer: ctx.writer, exit: ctx.exit },
      );
      return;
    }
  }
  const earningDir =
    ctx.env['JINN_EARNING_DIR'] ??
    config?.earningDir ??
    join(process.env['HOME'] ?? '.', '.jinn-client', 'earning');
  const dbPath = ctx.env['JINN_DB_PATH'] ?? config?.dbPath;
  const apiPort = config?.apiPort ?? 7331;
  const pidPath = join(earningDir, 'daemon.pid');

  const force = Boolean(parsed.values.force);
  const result = await jinnStop({
    pidfilePath: pidPath,
    port: apiPort,
    dbPath,
    force,
    waitForExit: force,
  });

  emitResult(
    result,
    (v) => {
      const value = v as StopResult;
      if (value.discoveredVia === 'port') {
        if (value.escalatedToSigkill) {
          return `Discovered daemon on port ${apiPort} (PID ${value.pid}); SIGTERM did not resolve, escalated to SIGKILL.`;
        }
        return value.killed
          ? `Discovered daemon on port ${apiPort} (PID ${value.pid}); sent SIGTERM.`
          : value.pid !== null
            ? `Daemon PID ${value.pid} was already gone (found via port ${apiPort}); cleaned stale state.`
            : `Daemon is already stopped.`;
      }
      if (value.escalatedToSigkill) {
        return `SIGTERM did not bring down daemon pid ${value.pid}; escalated to SIGKILL.`;
      }
      if (value.killed) {
        return `Sent SIGTERM to daemon pid ${value.pid}.`;
      }
      if (value.pid !== null) {
        return `Daemon pid ${value.pid} was already gone; cleaned stale state.`;
      }
      return 'Daemon is already stopped.';
    },
    {
      json: Boolean(parsed.values.json),
      human: Boolean(parsed.values.human),
      writer: ctx.writer,
      stdoutIsTty: ctx.stdoutIsTty,
      noColor: Boolean(ctx.env['NO_COLOR']),
    },
  );
}

const command: CommandModule = {
  name: 'stop',
  summary: 'Signal a running jinn daemon to shut down gracefully',
  helpText: `Usage: jinn stop [--human] [--force]

Reads the daemon pid from <earningDir>/daemon.pid and sends SIGTERM.
If the pidfile is missing, falls back to port-based discovery (lsof / ss).
Idempotent: if the daemon is already stopped, returns state=stopped and
killed=false with exit 0. Stale pidfiles are removed.

With --force, waits up to 10s for graceful exit after SIGTERM and then
escalates to SIGKILL if the daemon is still alive. Use this to recover
when a previous shutdown got stuck (e.g. EADDRINUSE on relaunch).

Examples:
  jinn stop
  jinn stop --human
  jinn stop --force
`,
  run,
};

export default command;
