import { describe, it, expect } from 'vitest';
import { parseTask } from '../../src/types/desired-state.js';

describe('Task', () => {
  it('parses a valid desired state', () => {
    const input = {
      description: 'The API should return 200 on /health',
      context: { endpoint: 'https://api.example.com/health' },
    };
    const result = parseTask(input);
    expect(result.description).toBe(input.description);
    expect(result.context).toEqual(input.context);
    expect(result.id).toBeDefined();
  });

  it('rejects a desired state without description', () => {
    expect(() => parseTask({ context: {} })).toThrow();
  });
});

describe('parseTask intent hydration', () => {
  it('hydrates loose fields from intent when loose fields are absent', () => {
    const intent = {
      schemaVersion: 'intent.v1' as const,
      id: 'abc',
      kind: 'portfolio.v0',
      description: 'trade',
      window: { startTs: 1, endTs: 86400001 },
      spec: { kind: 'portfolio.v0' },
      eligibility: {},
      creator: { safeAddress: '0xaaa', agentEoa: '0xbbb' },
      createdAt: 1,
      signature: {
        algo: 'secp256k1' as const,
        signer: '0xbbb',
        hash: '0x' + 'ab'.repeat(32),
        sig: '0x' + 'cd'.repeat(65),
      },
    };

    const parsed = parseTask({ intent });
    expect(parsed.description).toBe('trade');
    expect(parsed.window).toEqual({ startTs: 1, endTs: 86400001 });
    expect(parsed.solverType).toBe('portfolio.v0');
    expect(parsed.spec).toEqual({});
    expect(parsed.intent).toBeDefined();
  });

  it('loose fields override intent fields when both are present', () => {
    const intent = {
      schemaVersion: 'intent.v1' as const,
      id: 'abc',
      kind: 'portfolio.v0',
      description: 'from-intent',
      window: { startTs: 1, endTs: 86400001 },
      spec: { kind: 'portfolio.v0' },
      eligibility: {},
      creator: { safeAddress: '0xaaa', agentEoa: '0xbbb' },
      createdAt: 1,
      signature: {
        algo: 'secp256k1' as const,
        signer: '0xbbb',
        hash: '0x' + 'ab'.repeat(32),
        sig: '0x' + 'cd'.repeat(65),
      },
    };

    const parsed = parseTask({
      description: 'loose-wins',
      intent,
    });
    expect(parsed.description).toBe('loose-wins');
  });
});
