/**
 * Operator-level MCP server for jinn-client.
 *
 * Exposes tools that let an external agent (e.g. Claude Desktop) manage a jinn
 * fleet: read status, bootstrap, submit intents, start/stop the daemon.
 *
 * Entry point: client/src/bin/jinn-mcp.ts calls createOperatorServer().
 *
 * Design: wraps CLI command modules directly (Option B from the research doc).
 * Each command already accepts an injectable { writer, exit } context, so we
 * capture stdout into a string buffer and return it as the MCP tool response.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CommandModule, CommandContext } from '../cli/command.js';

// ── Read-only command imports ───────────────────────────────────────────────
import initCommand from '../cli/commands/init.js';
import doctorCommand from '../cli/commands/doctor.js';
import fundRequirementsCommand from '../cli/commands/fund-requirements.js';
import statusCommand from '../cli/commands/status.js';
import fleetCommand from '../cli/commands/fleet.js';
import balanceCommand from '../cli/commands/balance.js';
import historyCommand from '../cli/commands/history.js';

// ── Write (mutating) command imports ────────────────────────────────────────
import bootstrapCommand from '../cli/commands/bootstrap.js';
import submitIntentCommand from '../cli/commands/submit-intent.js';
import stopCommand from '../cli/commands/stop.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run a CLI CommandModule in-process, capturing its stdout output as a string.
 *
 * The CLI commands call `ctx.exit()` on completion or error. We intercept that
 * with a no-op so the MCP server process is not terminated. The captured text
 * is always the JSON envelope the command writes.
 */
async function runCommand(
  command: CommandModule,
  argv: string[],
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const chunks: string[] = [];
  const writer = {
    write(s: string): boolean {
      chunks.push(s);
      return true;
    },
  };
  const ctx: CommandContext = {
    argv,
    stdoutIsTty: false,
    writer,
    exit: () => {}, // no-op: prevent process.exit() in MCP context
    env,
  };
  await command.run(ctx);
  return chunks.join('');
}

// ── Server factory ──────────────────────────────────────────────────────────

export function createOperatorServer(): McpServer {
  const server = new McpServer({
    name: 'jinn-operator',
    version: '0.1.0',
  });

  // ━━ Read-only tools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  server.tool(
    'jinn_init',
    'Create the master wallet and write the encrypted keystore. Idempotent.',
    {},
    async () => {
      try {
        const text = await runCommand(initCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_doctor',
    'Preflight checks: node version, claude binary, keystore, deployment config.',
    {},
    async () => {
      try {
        const text = await runCommand(doctorCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_fund_requirements',
    'List addresses that need funding before bootstrap can advance.',
    {},
    async () => {
      try {
        const text = await runCommand(fundRequirementsCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_status',
    'Daemon liveness and fleet health roll-up. Poll this for monitoring.',
    {},
    async () => {
      try {
        const text = await runCommand(statusCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_fleet',
    'Per-service fleet detail: wallets, staking status, activity counts.',
    {},
    async () => {
      try {
        const text = await runCommand(fleetCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_balance',
    'Flat per-wallet balance map across master and service wallets.',
    {},
    async () => {
      try {
        const text = await runCommand(balanceCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_history',
    'Recent protocol activity: intents, claims, deliveries, evaluations, rewards.',
    {
      limit: z.number().optional().default(50).describe('Max results (default 50)'),
      since: z.string().optional().describe('Only return events after this ISO-8601 timestamp'),
    },
    async ({ limit, since }) => {
      try {
        const argv = ['--json', '--limit', String(limit)];
        if (since) argv.push('--since', since);
        const text = await runCommand(historyCommand, argv, process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  // ━━ Write (mutating) tools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  server.tool(
    'jinn_bootstrap',
    'Advance the fleet state machine. Idempotent. May take several minutes. Returns funding_required if wallet needs ETH.',
    {},
    async () => {
      try {
        const text = await runCommand(bootstrapCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_submit_intent',
    'Post a desired state (restoration job) to the protocol. Idempotent by id.',
    {
      id: z.string().describe('Unique intent identifier'),
      description: z.string().describe('Human-readable description of the desired state'),
      dry_run: z.boolean().optional().default(false).describe('Preview without posting on-chain'),
    },
    async ({ id, description, dry_run }) => {
      try {
        const argv = ['--id', id, '--description', description, '--json'];
        if (dry_run) argv.push('--dry-run');
        else argv.push('--yes'); // implicit confirmation in MCP context
        const text = await runCommand(submitIntentCommand, argv, process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    },
  );

  server.tool(
    'jinn_start_daemon',
    'Start the jinn daemon as a detached background process. Returns the PID.',
    {},
    async () => {
      const earningDir =
        process.env['JINN_EARNING_DIR'] ??
        join(process.env['HOME'] ?? '.', '.jinn-client', 'earning');
      const pidPath = join(earningDir, 'daemon.pid');

      // Check if already running
      if (existsSync(pidPath)) {
        try {
          const existingPid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
          process.kill(existingPid, 0); // existence check
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ pid: existingPid, status: 'already_running' }),
              },
            ],
          };
        } catch {
          /* stale pidfile — fall through to start */
        }
      }

      // Resolve jinn binary path relative to this file
      const jinnBinPath = fileURLToPath(new URL('../bin/jinn.js', import.meta.url));
      const child = spawn(process.execPath, [jinnBinPath, 'run'], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ pid: child.pid, status: 'started' }),
          },
        ],
      };
    },
  );

  server.tool(
    'jinn_stop_daemon',
    'Stop the running jinn daemon. Idempotent: returns success even if already stopped.',
    {},
    async () => {
      try {
        const text = await runCommand(stopCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch {
        // "No pidfile" is not an error in MCP context — daemon isn't running, which is the goal
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ status: 'not_running' }) },
          ],
        };
      }
    },
  );

  return server;
}
