import { createServer } from 'node:net';
import type { PortHolder } from './port-pid.js';
import { defaultPortPidLookup, formatUptime } from './port-pid.js';

export interface ApiPortPreflightOk {
  ok: true;
  port: number;
}

export interface ApiPortPreflightFail {
  ok: false;
  port: number;
  code?: string;
  message: string;
  /** Set when code === 'EADDRINUSE' and we could determine the holder. */
  holder?: PortHolder;
}

export type ApiPortPreflightResult = ApiPortPreflightOk | ApiPortPreflightFail;

export type PortPidLookup = (port: number) => Promise<PortHolder | null>;

export async function checkApiPortAvailable(
  port: number,
  portPidLookup: PortPidLookup = defaultPortPidLookup,
): Promise<ApiPortPreflightResult> {
  return new Promise((resolve) => {
    const server = createServer();
    let settled = false;

    const finish = (result: ApiPortPreflightResult) => {
      if (settled) return;
      settled = true;
      server.removeAllListeners();
      resolve(result);
    };

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        // Enrich with port-to-PID info asynchronously, then resolve.
        portPidLookup(port).then((holder) => {
          finish({
            ok: false,
            port,
            code: error.code,
            message: error.message,
            ...(holder !== null ? { holder } : {}),
          });
        }).catch(() => {
          finish({
            ok: false,
            port,
            code: error.code,
            message: error.message,
          });
        });
      } else {
        finish({
          ok: false,
          port,
          code: error.code,
          message: error.message,
        });
      }
    });

    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
      server.close(() => finish({ ok: true, port }));
    });
  });
}

export function apiPortFailureMessage(result: ApiPortPreflightFail): string {
  if (result.code === 'EADDRINUSE') {
    if (result.holder) {
      const { pid, command, uptimeSeconds } = result.holder;
      const uptimePart = uptimeSeconds !== null ? `, started ${formatUptime(uptimeSeconds)} ago` : '';
      return (
        `Port ${result.port} is held by PID ${pid} (${command}${uptimePart}). ` +
        `Run \`jinn stop --force\` to recover.`
      );
    }
    return (
      `Port ${result.port} is already in use. ` +
      `Run \`jinn stop\` or set JINN_API_PORT / apiPort to another port.`
    );
  }
  return `Port ${result.port} is not available: ${result.message}`;
}
