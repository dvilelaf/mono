import { spawnSync } from 'node:child_process';

export type LearnerHarnessName = 'claude-code-learner' | 'codex-code-learner';

export interface LearnerHarnessE2EConfig {
  harnessName: LearnerHarnessName;
  cliPath: string;
  model: string;
}

const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_CODEX_MODEL = 'gpt-5.4-mini';

export function readLearnerHarnessE2EConfig(env: NodeJS.ProcessEnv = process.env): LearnerHarnessE2EConfig {
  const rawHarness = env['JINN_E2E_LEARNER_HARNESS'] ?? env['JINN_LEARNER_HARNESS'] ?? 'claude-code-learner';
  if (rawHarness !== 'claude-code-learner' && rawHarness !== 'codex-code-learner') {
    throw new Error(
      `Unsupported JINN_E2E_LEARNER_HARNESS=${JSON.stringify(rawHarness)}; ` +
        'expected claude-code-learner or codex-code-learner',
    );
  }

  const cliPath = env['JINN_E2E_LEARNER_CLI_PATH']
    ?? (rawHarness === 'codex-code-learner' ? 'codex' : 'claude');
  const model = env['JINN_E2E_LEARNER_MODEL']
    ?? (rawHarness === 'codex-code-learner' ? DEFAULT_CODEX_MODEL : DEFAULT_CLAUDE_MODEL);

  return {
    harnessName: rawHarness,
    cliPath,
    model,
  };
}

export function checkLearnerCli(config: LearnerHarnessE2EConfig): { ok: true; version: string } | { ok: false; reason: string } {
  const check = spawnSync(config.cliPath, ['--version'], { encoding: 'utf8' });
  if (check.status !== 0) {
    return {
      ok: false,
      reason: `${config.cliPath} CLI not in PATH or not executable; set JINN_E2E_LEARNER_CLI_PATH to override`,
    };
  }
  return {
    ok: true,
    version: (check.stdout || check.stderr).trim(),
  };
}
