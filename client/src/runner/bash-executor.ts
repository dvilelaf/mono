/**
 * Filtered Bash executor for autonomous-mode sessions.
 *
 * Wraps child_process.exec with the bash-filter. Refused commands are logged
 * to workingDir/.bash/refused.jsonl (one JSON object per line) and returned
 * as a non-zero result without executing the underlying command.
 *
 * This is the integration point that wires isPackageInstallCommand into the
 * actual execution path. Expose it as an MCP tool or hook wherever a shell
 * command originates from an autonomous agent.
 */

import { exec } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isPackageInstallCommand } from './bash-filter.js';

const execAsync = promisify(exec);

export interface BashExecutorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Present when the command was refused by the filter. */
  refusal?: {
    rule: string;
    reason: string;
  };
}

/**
 * Execute a shell command, applying the package-install filter first.
 *
 * If the command is blocked:
 * - Appends a JSONL entry to `workingDir/.bash/refused.jsonl`
 * - Returns exitCode 1 with the refusal reason in stderr
 * - Does NOT execute the command
 *
 * If the command is allowed, executes it and returns the result.
 */
export async function executeBashWithFilter(
  command: string,
  workingDir: string,
): Promise<BashExecutorResult> {
  const check = isPackageInstallCommand(command);

  if (check.blocked) {
    // Log refusal (mkdir -p style, idempotent)
    const bashDir = join(workingDir, '.bash');
    mkdirSync(bashDir, { recursive: true });
    const logPath = join(bashDir, 'refused.jsonl');
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      command,
      rule: check.matchedRule ?? 'unknown',
    });
    appendFileSync(logPath, entry + '\n', 'utf-8');

    return {
      exitCode: 1,
      stdout: '',
      stderr: check.reason ?? 'Command refused by bash filter',
      refusal: {
        rule: check.matchedRule ?? 'unknown',
        reason: check.reason ?? 'Command refused by bash filter',
      },
    };
  }

  try {
    const { stdout, stderr } = await execAsync(command, { cwd: workingDir });
    return { exitCode: 0, stdout, stderr };
  } catch (err: unknown) {
    // child_process.exec rejects with an error that has code/stdout/stderr
    const execErr = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? execErr.message ?? String(err),
    };
  }
}

/**
 * Count refused commands recorded in workingDir/.bash/refused.jsonl.
 * Returns 0 if the file does not exist or is empty.
 */
export function countRefusedCommands(workingDir: string): number {
  const logPath = join(workingDir, '.bash', 'refused.jsonl');
  try {
    const lines = readFileSync(logPath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    return lines.length;
  } catch {
    return 0;
  }
}
