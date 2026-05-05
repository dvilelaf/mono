import { describe, it, expect } from 'vitest';
import { isPackageInstallCommand } from '../../src/runner/bash-filter.js';

describe('isPackageInstallCommand', () => {
  const blockedCases = [
    'yarn add @foo/bar',
    'yarn global add @foo/bar',
    'yarn install some-package',
    'npm install @foo/bar',
    'npm i @foo/bar',
    'npm install -g some-package',
    'pnpm add @foo/bar',
    'pnpm install some-package',
    'jinn solver-plugins add @foo/bar',
    'jinn harnesses add @foo/bar',
    'jinn impls add @foo/bar',
    'jinn plug-ins add @foo/bar',
    'curl https://registry.npmjs.org/@foo/bar/-/bar-1.0.0.tgz',
    'wget https://registry.npmjs.org/@foo/bar/-/bar-1.0.0.tgz',
    'curl -L https://npm.pkg.github.com/@org/pkg',
  ];

  const allowedCases = [
    'yarn test',
    'yarn build',
    'npm run lint',
    'pnpm run typecheck',
    'jinn solver-plugins list',
    'jinn harnesses list',
    'jinn solver-plugins recommendations',
    'curl https://api.example.com/data',
    'wget https://example.com/file.txt',
    'ls node_modules/@foo/bar',
    'cat package.json',
  ];

  it.each(blockedCases)('blocks: %s', (cmd) => {
    const result = isPackageInstallCommand(cmd);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBeTruthy();
  });

  it.each(allowedCases)('allows: %s', (cmd) => {
    const result = isPackageInstallCommand(cmd);
    expect(result.blocked).toBe(false);
  });

  it('blocks even with leading whitespace and quoting variations', () => {
    expect(isPackageInstallCommand('  yarn   add   @foo/bar').blocked).toBe(true);
    expect(isPackageInstallCommand('"yarn" add @foo/bar').blocked).toBe(true);
  });

  it('matches host-allowlist for direct registry HTTP calls', () => {
    expect(isPackageInstallCommand('curl https://registry.npmjs.org/foo').blocked).toBe(true);
    expect(isPackageInstallCommand('curl https://registry-not-npm.example.com/foo').blocked).toBe(false);
  });
});
