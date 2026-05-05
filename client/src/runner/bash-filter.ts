/**
 * Bash command filter for autonomous-mode harnesses.
 *
 * Blocks package-install commands (yarn add, npm install, pnpm add, jinn
 * solver-plugins add, etc.) and direct HTTP calls to npm registries, closing
 * threat N4 from spec/2026-05-05-plug-in-and-harness-network-trust.md §2.3.
 *
 * This is a pure function — no I/O, no side effects. Wire it at any point
 * where a shell command string is about to be executed on behalf of an
 * autonomous agent session.
 */

export interface BashFilterResult {
  blocked: boolean;
  reason?: string;
  matchedRule?: string;
}

const BLOCKED_NPM_REGISTRIES = [
  'registry.npmjs.org',
  'npm.pkg.github.com',
  'registry.yarnpkg.com',
];

const BLOCKED_COMMAND_PATTERNS: Array<{ pattern: RegExp; rule: string }> = [
  { pattern: /^\s*"?yarn"?\s+(global\s+)?add\b/, rule: 'yarn-add' },
  { pattern: /^\s*"?yarn"?\s+install\s+\S/, rule: 'yarn-install-pkg' },
  { pattern: /^\s*"?npm"?\s+(install|i)\s+(?!--?$)\S/, rule: 'npm-install-pkg' },
  { pattern: /^\s*"?pnpm"?\s+(add|install)\s+\S/, rule: 'pnpm-install-pkg' },
  { pattern: /^\s*"?jinn"?\s+(solver-plugins|harnesses|impls|plug-ins)\s+add\b/, rule: 'jinn-install' },
];

function urlsInCommand(cmd: string): URL[] {
  const matches = cmd.match(/https?:\/\/[^\s'"]+/g) ?? [];
  return matches
    .map((s) => {
      try {
        return new URL(s);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => u !== null);
}

export function isPackageInstallCommand(command: string): BashFilterResult {
  for (const { pattern, rule } of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return {
        blocked: true,
        reason: `Refused: package-install commands disabled in autonomous-mode (rule: ${rule})`,
        matchedRule: rule,
      };
    }
  }

  if (/^\s*"?(curl|wget|fetch)"?\s+/i.test(command)) {
    const urls = urlsInCommand(command);
    for (const url of urls) {
      if (BLOCKED_NPM_REGISTRIES.includes(url.hostname)) {
        return {
          blocked: true,
          reason: `Refused: direct npm-registry HTTP calls disabled (host: ${url.hostname})`,
          matchedRule: 'npm-registry-http',
        };
      }
    }
  }

  return { blocked: false };
}
