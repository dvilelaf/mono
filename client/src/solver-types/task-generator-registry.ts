// Runtime resolution of `manifest.contract.taskGenerator.implementation`
// strings to launcher-side generator factories. Sibling pattern to
// `PreconditionResolverRegistry` (`harnesses/engine/precondition-resolver.ts`):
// same Map-of-string-to-factory shape, different value type.
//
// Today this only registers `prediction.v1`; the factory return type
// reflects that. When a second generator kind lands, lift the return type
// (and the dep imports below) to a polymorphic `TaskGenerator` umbrella.

import type { LaunchedSolverNetRecord } from '../solvernets/store.js';
import type {
  PredictionV1GeneratorRuntimeConfig,
  PredictionV1GeneratorStaticConfig,
  PredictionV1GeneratorTick,
} from './prediction-v1-auto.js';
import { makePredictionV1GeneratorForLaunchedRecord } from './prediction-v1-auto.js';

export interface TaskGeneratorFactoryDeps {
  recordRef: { current: LaunchedSolverNetRecord };
  configRef: { current: PredictionV1GeneratorRuntimeConfig };
  staticConfig?: PredictionV1GeneratorStaticConfig;
}

export type TaskGeneratorFactory = (deps: TaskGeneratorFactoryDeps) => PredictionV1GeneratorTick;

/** Exact-match lookup — no globbing, no version-resolution magic. */
export class TaskGeneratorRegistry {
  private readonly factories = new Map<string, TaskGeneratorFactory>();

  register(implementation: string, factory: TaskGeneratorFactory): this {
    this.factories.set(implementation, factory);
    return this;
  }

  resolve(implementation: string): TaskGeneratorFactory | undefined {
    return this.factories.get(implementation);
  }

  has(implementation: string): boolean {
    return this.factories.has(implementation);
  }
}

export function createDefaultTaskGeneratorRegistry(): TaskGeneratorRegistry {
  const registry = new TaskGeneratorRegistry();
  registry.register(
    'client/src/solver-types/prediction-v1-auto',
    makePredictionV1GeneratorForLaunchedRecord,
  );
  return registry;
}
