/**
 * port-pid.ts — port-to-PID resolution
 *
 * Abstracts the OS-level call behind a small helper so callers (jinn stop,
 * api-port preflight) can inject a mock in tests. Production uses lsof on
 * macOS/Linux (when available) and falls back to `ss -lntp` on Linux. If
 * neither tool is found or parsing fails, returns null gracefully — callers
 * must handle a null result without crashing.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface PortHolder {
  pid: number;
  command: string;
  uptimeSeconds: number | null;
}

/**
 * Default implementation: calls lsof (or ss on Linux as fallback) to find
 * the process holding `port`. Returns null when the tool is unavailable,
 * yields no output, or parsing fails.
 */
export async function defaultPortPidLookup(port: number): Promise<PortHolder | null> {
  // Try lsof first (macOS + most Linux distros with lsof installed)
  const lsofResult = tryLsof(port);
  if (lsofResult !== null) return lsofResult;

  // Fallback: ss -lntp (Linux iproute2)
  const ssResult = trySs(port);
  if (ssResult !== null) return ssResult;

  return null;
}

function tryLsof(port: number): PortHolder | null {
  try {
    const out = execSync(`lsof -i :${port} -n -P -F pcu`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseLsofOutput(out);
  } catch {
    return null;
  }
}

/**
 * Parse lsof -F pcu output. The -F flag gives field output:
 *   p<pid>\nc<command>\nu<user>\n...
 * We look for lines with 'p' (pid) and 'c' (command).
 * Exported for unit testing.
 */
export function parseLsofOutput(out: string): PortHolder | null {
  if (!out.trim()) return null;
  const lines = out.split('\n');
  let pid: number | null = null;
  let command: string | null = null;
  for (const line of lines) {
    if (line.startsWith('p')) {
      const n = parseInt(line.slice(1), 10);
      if (Number.isFinite(n)) pid = n;
    } else if (line.startsWith('c')) {
      command = line.slice(1).trim();
    }
    if (pid !== null && command !== null) break;
  }
  if (pid === null || command === null) {
    return null;
  }
  return {
    pid,
    command,
    uptimeSeconds: tryGetProcessUptimeSeconds(pid),
  };
}

function trySs(port: number): PortHolder | null {
  try {
    // ss -lntp 'sport = :PORT' — lists listening TCP sockets on that port
    const out = execSync(`ss -lntp "sport = :${port}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseSsOutput(out);
  } catch {
    return null;
  }
}

/**
 * Parse ss -lntp output. Lines look like:
 *   LISTEN  0  128  0.0.0.0:7331  0.0.0.0:*  users:(("node",pid=12345,fd=20))
 * Exported for unit testing.
 */
export function parseSsOutput(out: string): PortHolder | null {
  const lines = out.split('\n').filter(Boolean);
  for (const line of lines) {
    const m = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    if (m) {
      const command = m[1] as string;
      const pid = parseInt(m[2] as string, 10);
      if (Number.isFinite(pid)) {
        return {
          pid,
          command,
          uptimeSeconds: tryGetProcessUptimeSeconds(pid),
        };
      }
    }
  }
  return null;
}

/**
 * Attempt to determine how long a process has been running by reading
 * /proc/<pid>/stat (Linux) or using ps on macOS. Returns null if unavailable.
 */
function tryGetProcessUptimeSeconds(pid: number): number | null {
  // Linux: /proc/<pid>/stat has start time in clock ticks from boot
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const uptimeRaw = readFileSync('/proc/uptime', 'utf-8');
    const uptimeStr = uptimeRaw.split(' ')[0];
    const uptimeSecs = uptimeStr ? parseFloat(uptimeStr) : null;
    const fields = stat.split(' ');
    // Field 22 (index 21) is starttime in clock ticks
    const startTicks = parseInt(fields[21] ?? '0', 10);
    const clkTck = 100; // sysconf(_SC_CLK_TCK) — almost always 100 on Linux
    if (Number.isFinite(startTicks) && uptimeSecs !== null) {
      const startSecs = startTicks / clkTck;
      const elapsed = uptimeSecs - startSecs;
      return Math.max(0, Math.round(elapsed));
    }
  } catch {
    /* not Linux or permission denied */
  }

  // macOS: ps -o etime= -p <pid>
  try {
    const out = execSync(`ps -o etime= -p ${pid}`, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return parseEtime(out);
  } catch {
    return null;
  }
}

/**
 * Parse ps etime format: [[DD-]HH:]MM:SS
 */
export function parseEtime(etime: string): number | null {
  const t = etime.trim();
  // Format: [[DD-]HH:]MM:SS
  const parts = t.split(':');
  if (parts.length === 2) {
    // MM:SS
    const mm = parseInt(parts[0] ?? '0', 10);
    const ss = parseInt(parts[1] ?? '0', 10);
    if (Number.isFinite(mm) && Number.isFinite(ss)) return mm * 60 + ss;
  } else if (parts.length === 3) {
    // HH:MM:SS or DD-HH:MM:SS
    const hhPart = parts[0] ?? '0';
    const mm = parseInt(parts[1] ?? '0', 10);
    const ss = parseInt(parts[2] ?? '0', 10);
    if (hhPart.includes('-')) {
      const [ddStr, hhStr] = hhPart.split('-');
      const dd = parseInt(ddStr ?? '0', 10);
      const hh = parseInt(hhStr ?? '0', 10);
      if ([dd, hh, mm, ss].every(Number.isFinite)) {
        return dd * 86400 + hh * 3600 + mm * 60 + ss;
      }
    } else {
      const hh = parseInt(hhPart, 10);
      if ([hh, mm, ss].every(Number.isFinite)) return hh * 3600 + mm * 60 + ss;
    }
  }
  return null;
}

/** Format uptimeSeconds into a human-readable string like "1d4h" or "2h3m". */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}
