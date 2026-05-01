import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeMcpHyperliquidImpl } from '../../src/harnesses/impls/claude-mcp-hyperliquid/index.js';
import { buildHarnesses, type HarnessEnv } from '../../src/harnesses/impls/index.js';

import {
  buildIntentsCliRegistry,
  DEFAULT_BY_SOLVER_TYPE,
  DEFAULT_DISABLED_IMPLS,
  isImplDisabled,
  resetImplForKindInConfig,
  resolveEffectiveBySolverType,
  resolveEffectiveDisabled,
  setImplEnabledInConfig,
  setImplForKindInConfig,
} from '../../src/cli/intent-registry-access.js';
import { loadConfig, type JinnConfig } from '../../src/config.js';

describe('setImplEnabledInConfig', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jinn-intent-cfg-'));
    configPath = join(dir, 'config.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('creates config with default-disabled set when file absent', () => {
    const result = setImplEnabledInConfig('claude-mcp-hyperliquid', false, configPath);
    expect(result).toEqual(expect.arrayContaining([...DEFAULT_DISABLED_IMPLS]));
    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.harnesses.disabled).toEqual(expect.arrayContaining([...DEFAULT_DISABLED_IMPLS]));
  });

  it('removes impl from disabled[] when enabled=true', () => {
    // Seed with full default.
    setImplEnabledInConfig('claude-mcp-hyperliquid', false, configPath);
    const result = setImplEnabledInConfig('claude-mcp-hyperliquid', true, configPath);
    expect(result).not.toContain('claude-mcp-hyperliquid');
  });

  it('re-adds impl to disabled[] when enabled=false after enable', () => {
    setImplEnabledInConfig('claude-mcp-hyperliquid', true, configPath);
    const result = setImplEnabledInConfig('claude-mcp-hyperliquid', false, configPath);
    expect(result).toContain('claude-mcp-hyperliquid');
  });

  it('preserves operator-added non-default disabled impls across enable flips', () => {
    // Operator hand-disables something that isn't a ship default.
    writeFileSync(
      configPath,
      JSON.stringify({
        harnesses: { disabled: ['claude-mcp-hyperliquid', 'custom-evil-impl'] },
      }),
    );
    const result = setImplEnabledInConfig('claude-mcp-hyperliquid', true, configPath);
    expect(result).not.toContain('claude-mcp-hyperliquid');
    expect(result).toContain('custom-evil-impl');
  });

  it("rebuilds from defaults, not from the user's last list, so future default-disables stay off", () => {
    // Operator had previously enabled the one default impl.
    writeFileSync(configPath, JSON.stringify({ harnesses: { disabled: [] } }));
    // Suppose we add a new default-disabled impl in code. We simulate by
    // re-invoking setImplEnabledInConfig for a DIFFERENT impl — the rebuild
    // path must include every current default.
    const result = setImplEnabledInConfig('claude-mcp-hyperliquid', false, configPath);
    expect(result).toEqual(expect.arrayContaining([...DEFAULT_DISABLED_IMPLS]));
  });

  it('preserves unrelated top-level config keys', () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        network: 'testnet',
        rpcUrl: 'http://example.com',
        harnesses: { disabled: [...DEFAULT_DISABLED_IMPLS] },
      }),
    );
    setImplEnabledInConfig('claude-mcp-hyperliquid', true, configPath);
    const after = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(after.network).toBe('testnet');
    expect(after.rpcUrl).toBe('http://example.com');
  });
});

describe('resolveEffectiveDisabled', () => {
  it('returns defaults when user has not set harnesses.disabled', () => {
    const config = {} as JinnConfig;
    expect(resolveEffectiveDisabled(config)).toEqual([...DEFAULT_DISABLED_IMPLS]);
  });

  it('returns user list when harnesses.disabled is set (full replace)', () => {
    const config = { harnesses: { disabled: [] } } as unknown as JinnConfig;
    expect(resolveEffectiveDisabled(config)).toEqual([]);
  });
});

describe('isImplDisabled', () => {
  it('returns true when impl is in effective disabled list', () => {
    expect(isImplDisabled('claude-mcp-hyperliquid', {} as JinnConfig)).toBe(true);
  });

  it('returns false after operator enables impl via config', () => {
    const config = { harnesses: { disabled: [] } } as unknown as JinnConfig;
    expect(isImplDisabled('claude-mcp-hyperliquid', config)).toBe(false);
  });
});

describe('bySolverType config helpers', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jinn-intent-bykind-'));
    configPath = join(dir, 'config.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes and resets a bySolverType override', () => {
    setImplForKindInConfig('prediction.v0', 'claude-mcp-prediction', configPath);
    let written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.harnesses.bySolverType['prediction.v0']).toBe('claude-mcp-prediction');

    resetImplForKindInConfig('prediction.v0', configPath);
    written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.harnesses.bySolverType['prediction.v0']).toBeUndefined();
  });

  it('merges user bySolverType over defaults', () => {
    const config = {
      harnesses: {
        bySolverType: {
          'prediction.v0': 'claude-mcp-prediction',
        },
      },
    } as unknown as JinnConfig;
    const bySolverType = resolveEffectiveBySolverType(config);
    expect(bySolverType['portfolio.v0']).toBe(DEFAULT_BY_SOLVER_TYPE['portfolio.v0']);
    expect(bySolverType['prediction.v0']).toBe('claude-mcp-prediction');
  });
});

describe('buildIntentsCliRegistry', () => {
  let dir: string;
  let configPath: string;
  let capturedEnv: HarnessEnv | null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jinn-intent-reg-'));
    configPath = join(dir, 'config.json');
    capturedEnv = null;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('wires config.engine.implStateDirRoot to the hyperliquid impl state path', () => {
    const customImplRoot = join(dir, 'custom-impl-state');
    const expectedHlStateDir = join(customImplRoot, 'claude-mcp-hyperliquid');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          network: 'testnet',
          rpcUrl: 'https://sepolia.base.org',
          desiredStates: [],
          engine: {
            workingDirRoot: join(dir, 'custom-work'),
            implStateDirRoot: customImplRoot,
          },
        },
        null,
        2,
      ),
    );
    const config = loadConfig(configPath);
    expect(config.engine.implStateDirRoot).toBe(customImplRoot);

    // Inject a spy that captures the env arg and delegates to the real impl.
    const buildImpls = vi.fn((env: HarnessEnv) => {
      capturedEnv = env;
      return buildHarnesses(env);
    });

    const registry = buildIntentsCliRegistry(config, buildImpls);
    expect(capturedEnv).not.toBeNull();
    expect(capturedEnv?.implStateDirRoot).toBe(customImplRoot);
    expect(capturedEnv?.stub).toBe(true);
    const hl = registry.list().find((i) => i.name === 'claude-mcp-hyperliquid');
    expect(hl).toBeInstanceOf(ClaudeMcpHyperliquidImpl);
    expect(hl.resolvedImplStateDir()).toBe(expectedHlStateDir);
  });
});
