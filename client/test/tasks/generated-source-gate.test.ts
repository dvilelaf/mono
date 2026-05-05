import { describe, expect, it } from 'vitest';
import { generatedTaskSourceSupported } from '../../src/tasks/generated-source-gate.js';

describe('generatedTaskSourceSupported', () => {
  it('registers launcher-owned generators even when legacy enabled is false', () => {
    expect(
      generatedTaskSourceSupported(
        {
          prediction: {
            enabled: false,
            solverType: 'prediction.v1',
            roles: ['solving', 'launching'],
            taskGenerator: { enabled: true },
          },
        },
        'prediction.v1',
      ),
    ).toBe(true);
  });

  it('does not register disabled legacy generators without launching role', () => {
    expect(
      generatedTaskSourceSupported(
        {
          predictionApy: {
            enabled: false,
            solverType: 'prediction.apy.v0',
            roles: ['solving'],
            taskGenerator: { enabled: true },
          },
        },
        'prediction.apy.v0',
      ),
    ).toBe(false);
  });

  it('preserves the legacy enabled solving gate', () => {
    expect(
      generatedTaskSourceSupported(
        {
          prediction: {
            enabled: true,
            solverType: 'prediction.v1',
            roles: ['solving'],
            taskGenerator: { enabled: true },
          },
        },
        'prediction.v1',
      ),
    ).toBe(true);
  });

  it('does not let evaluator-only nets create restoration tasks', () => {
    expect(
      generatedTaskSourceSupported(
        {
          prediction: {
            enabled: true,
            solverType: 'prediction.v1',
            roles: ['evaluating'],
            taskGenerator: { enabled: true },
          },
        },
        'prediction.v1',
      ),
    ).toBe(false);
  });

  it('requires task generation to be enabled', () => {
    expect(
      generatedTaskSourceSupported(
        {
          prediction: {
            enabled: false,
            solverType: 'prediction.v1',
            roles: ['launching'],
            taskGenerator: { enabled: false },
          },
        },
        'prediction.v1',
      ),
    ).toBe(false);
  });
});
