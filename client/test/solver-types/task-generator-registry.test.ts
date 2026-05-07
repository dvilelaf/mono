import { describe, expect, it, vi } from 'vitest';
import {
  TaskGeneratorRegistry,
  createDefaultTaskGeneratorRegistry,
  type TaskGeneratorFactory,
} from '../../src/solver-types/task-generator-registry.js';

describe('TaskGeneratorRegistry', () => {
  it('returns undefined for unregistered implementation strings', () => {
    const registry = new TaskGeneratorRegistry();
    expect(registry.resolve('client/src/solver-types/does-not-exist')).toBeUndefined();
    expect(registry.has('client/src/solver-types/does-not-exist')).toBe(false);
  });

  it('looks up registered factories by exact implementation string', () => {
    const factory = vi.fn() as unknown as TaskGeneratorFactory;
    const registry = new TaskGeneratorRegistry();
    registry.register('client/src/solver-types/example', factory);
    expect(registry.resolve('client/src/solver-types/example')).toBe(factory);
    expect(registry.has('client/src/solver-types/example')).toBe(true);
    // Lookup is exact-match — substrings don't resolve.
    expect(registry.resolve('client/src/solver-types/example.ts')).toBeUndefined();
  });

  it('register() returns the registry to support chaining', () => {
    const registry = new TaskGeneratorRegistry();
    const result = registry.register('a', vi.fn() as unknown as TaskGeneratorFactory);
    expect(result).toBe(registry);
  });

  it('register() overrides a previously-registered factory for the same string', () => {
    const first = vi.fn() as unknown as TaskGeneratorFactory;
    const second = vi.fn() as unknown as TaskGeneratorFactory;
    const registry = new TaskGeneratorRegistry();
    registry.register('a', first);
    registry.register('a', second);
    expect(registry.resolve('a')).toBe(second);
  });
});

describe('createDefaultTaskGeneratorRegistry', () => {
  it('pre-registers the prediction.v1 auto-generator under its canonical implementation pointer', () => {
    const registry = createDefaultTaskGeneratorRegistry();
    // Same string the SDK manifest schema declares for prediction.v1 (see
    // PREDICTION_V1_SOLVER_NET_CONTRACT.taskGenerator.implementation).
    expect(registry.has('client/src/solver-types/prediction-v1-auto')).toBe(true);
    const factory = registry.resolve('client/src/solver-types/prediction-v1-auto');
    expect(typeof factory).toBe('function');
  });

  it('does not register implementations the SDK manifests do not advertise', () => {
    const registry = createDefaultTaskGeneratorRegistry();
    expect(registry.has('client/src/solver-types/prediction-v0-auto')).toBe(false);
    expect(registry.has('client/src/solver-types/random-generator')).toBe(false);
  });
});
