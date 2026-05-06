import { describe, it, expect, vi } from 'vitest';
import {
  PreconditionResolverRegistry,
  createDefaultPreconditionRegistry,
  createPolymarketResolutionResolver,
  interpolateSource,
} from '../../../src/harnesses/engine/precondition-resolver.js';
import type { Task } from '../../../src/types/index.js';
import type { ResolutionSnapshot } from '../../../src/venues/polymarket/client.js';

function makeTask(spec: Record<string, unknown> = {}): Task {
  return {
    id: 'fixture',
    description: 'fixture',
    role: 'evaluation',
    solverType: 'prediction.v1',
    solverNetManifestCid: 'bafkreitestfixture',
    contractId: 'prediction',
    contractVersion: 'v1',
    spec,
  } as unknown as Task;
}

function snapshot(overrides: Partial<ResolutionSnapshot>): ResolutionSnapshot {
  return {
    venue: 'polymarket',
    marketId: 'mkt-1',
    conditionId: '0xabc',
    status: 'unresolved',
    sourceUrl: 'https://polymarket.com/market/foo',
    ...overrides,
  };
}

describe('PreconditionResolverRegistry', () => {
  it('returns ok:false for an unknown kind with a descriptive reason', async () => {
    const reg = new PreconditionResolverRegistry();
    const result = await reg.resolve(
      { kind: 'unregistered.thing', source: 'x', expects: 'y' },
      { task: makeTask() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('no resolver registered');
      expect(result.reason).toContain('unregistered.thing');
    }
  });

  it('dispatches by kind', async () => {
    const reg = new PreconditionResolverRegistry();
    reg.register('test.kind', async () => ({ ok: true }));
    const r = await reg.resolve(
      { kind: 'test.kind', source: '/', expects: 'true' },
      { task: makeTask() },
    );
    expect(r).toEqual({ ok: true });
  });

  it('catches resolver errors and returns ok:false', async () => {
    const reg = new PreconditionResolverRegistry();
    reg.register('test.boom', async () => { throw new Error('something broke'); });
    const r = await reg.resolve(
      { kind: 'test.boom', source: '/', expects: 'true' },
      { task: makeTask() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/something broke/);
  });

  it('checkAll short-circuits on first failure', async () => {
    const reg = new PreconditionResolverRegistry();
    const second = vi.fn(async () => ({ ok: true as const }));
    reg.register('a', async () => ({ ok: false, reason: 'a-fail' }));
    reg.register('b', second);
    const r = await reg.checkAll(
      [
        { kind: 'a', source: '/', expects: 'x' },
        { kind: 'b', source: '/', expects: 'x' },
      ],
      { task: makeTask() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('a-fail');
    expect(second).not.toHaveBeenCalled();
  });

  it('checkAll returns ok for an empty preconditions list', async () => {
    const reg = new PreconditionResolverRegistry();
    const r = await reg.checkAll([], { task: makeTask() });
    expect(r).toEqual({ ok: true });
  });
});

describe('interpolateSource', () => {
  it('resolves a single placeholder', () => {
    const task = makeTask({ source: { url: 'https://polymarket.com/market/foo' } });
    expect(
      interpolateSource('${task.spec.source.url}', task),
    ).toBe('https://polymarket.com/market/foo');
  });

  it('resolves multiple placeholders mixed with literal text', () => {
    const task = makeTask({ a: '1', b: '2' });
    expect(interpolateSource('A=${task.spec.a};B=${task.spec.b}', task)).toBe('A=1;B=2');
  });

  it('throws on unresolvable path', () => {
    const task = makeTask({});
    expect(() => interpolateSource('${task.spec.missing}', task)).toThrow(/did not resolve/);
  });
});

describe('polymarket resolution resolver', () => {
  it('returns ok:true when status === expects', async () => {
    const getResolution = vi.fn(async () => snapshot({ status: 'resolved' }));
    const resolver = createPolymarketResolutionResolver({ getResolution: getResolution as never });
    const task = makeTask({ source: { url: 'https://polymarket.com/market/foo' } });

    const r = await resolver(
      {
        kind: 'oracle.polymarket.resolution',
        source: '${task.spec.source.url}',
        expects: 'resolved',
      },
      { task },
    );
    expect(r).toEqual({ ok: true });
    expect(getResolution).toHaveBeenCalledWith({ sourceUrl: 'https://polymarket.com/market/foo' });
  });

  it('returns ok:false when status !== expects, with descriptive reason', async () => {
    const getResolution = vi.fn(async () => snapshot({ status: 'unresolved' }));
    const resolver = createPolymarketResolutionResolver({ getResolution: getResolution as never });
    const task = makeTask({ source: { url: 'https://polymarket.com/market/foo' } });

    const r = await resolver(
      {
        kind: 'oracle.polymarket.resolution',
        source: '${task.spec.source.url}',
        expects: 'resolved',
      },
      { task },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("status='unresolved'");
      expect(r.reason).toContain("expected 'resolved'");
    }
  });

  it('createDefaultPreconditionRegistry pre-registers the polymarket resolver', () => {
    const reg = createDefaultPreconditionRegistry({
      getResolution: (async () => snapshot({ status: 'resolved' })) as never,
    });
    expect(reg.has('oracle.polymarket.resolution')).toBe(true);
  });
});
