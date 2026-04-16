/**
 * Operator-level MCP server for jinn-client.
 *
 * Exposes CLI commands as MCP tools so that an outer agent (e.g. Claude
 * Desktop, a fleet orchestrator) can inspect and manage a jinn node without
 * shelling out.  Each tool delegates to the same CommandModule that the
 * `jinn` CLI uses, capturing stdout into a string.
 *
 * Entry point: src/bin/jinn-mcp.ts
 * Context: docs/research/2026-04-agent-packaging.md sections 2.2, 5.1-5.3
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import statusCommand from '../cli/commands/status.js';
import doctorCommand from '../cli/commands/doctor.js';
import fleetCommand from '../cli/commands/fleet.js';
import balanceCommand from '../cli/commands/balance.js';
import historyCommand from '../cli/commands/history.js';
import rewardsCommand from '../cli/commands/rewards.js';
import initCommand from '../cli/commands/init.js';
import type { CommandModule } from '../cli/command.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class StringWriter {
  private chunks: string[] = [];
  write(s: string): boolean {
    this.chunks.push(s);
    return true;
  }
  toString(): string {
    return this.chunks.join('');
  }
}

async function runCommand(
  command: CommandModule,
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<string> {
  const writer = new StringWriter();
  await command.run({
    argv,
    stdoutIsTty: false,
    writer,
    exit: () => {},
    env,
  });
  return writer.toString();
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createOperatorServer(): McpServer {
  const server = new McpServer({
    name: 'jinn-operator',
    version: '0.1.0',
  });

  // 1. jinn_status
  server.tool(
    'jinn_status',
    'Daemon liveness and monitoring roll-up',
    {},
    async () => {
      try {
        const text = await runCommand(statusCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // 2. jinn_doctor
  server.tool(
    'jinn_doctor',
    'Preflight checks: node version, claude binary, keystore, deployment',
    { config: z.string().optional().describe('Path to jinn config file') },
    async ({ config }) => {
      try {
        const argv = ['--json', ...(config ? ['--config', config] : [])];
        const text = await runCommand(doctorCommand, argv, process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // 3. jinn_fleet
  server.tool(
    'jinn_fleet',
    'Per-service fleet detail: wallets, staking, rewards, attention flags',
    {},
    async () => {
      try {
        const text = await runCommand(fleetCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // 4. jinn_balance
  server.tool(
    'jinn_balance',
    'Flat per-wallet balance map across master and service wallets',
    {},
    async () => {
      try {
        const text = await runCommand(balanceCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // 5. jinn_history
  server.tool(
    'jinn_history',
    'Recent protocol activity',
    {
      limit: z.number().int().min(1).max(500).optional().describe('Max events'),
      since: z.string().optional().describe('ISO-8601 timestamp filter'),
    },
    async ({ limit, since }) => {
      try {
        const argv = [
          '--json',
          ...(limit ? ['--limit', String(limit)] : []),
          ...(since ? ['--since', since] : []),
        ];
        const text = await runCommand(historyCommand, argv, process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // 6. jinn_rewards
  server.tool(
    'jinn_rewards',
    'Earned vs claimed per service; next checkpoint time',
    {},
    async () => {
      try {
        const text = await runCommand(rewardsCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // 7. jinn_init
  server.tool(
    'jinn_init',
    'Generate master wallet and write encrypted keystore (idempotent)',
    {},
    async () => {
      try {
        const text = await runCommand(initCommand, ['--json'], process.env);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  return server;
}
