// TaskGeneratorRegistry — runtime resolution of `manifest.contract.taskGenerator.implementation`
// strings to launcher-side generator factories. Mirrors the harness-resolution
// pattern used for evaluators (see `client/src/harnesses/impls/index.ts:buildHarnesses`).
//
// Why: the manifest declares `taskGenerator: { id, implementation }` so that
// every operator-launcher running the same SolverNet CID converges on the
// same generator code. This file is the dispatch layer: at daemon startup
// (Stage C of jinn-mono-04wq), `main.ts` resolves each launched record's
// manifest implementation pointer to a factory and spawns the generator.
//
// New SolverNets register their implementation string against a factory via
// `register()`. The default registry ships with `prediction.v1` only;
// additional kinds become side-effect imports + registrations as they land.

import type { LaunchedSolverNetRecord } from '../solvernets/store.js';
import type {
  PredictionV1GeneratorRuntimeConfig,
  PredictionV1GeneratorStaticConfig,
  PredictionV1GeneratorTick,
} from './prediction-v1-auto.js';
import { makePredictionV1GeneratorForLaunchedRecord } from './prediction-v1-auto.js';

/**
 * Inputs every launcher-side generator factory accepts. The shape mirrors
 * `MakePredictionV1GeneratorForLaunchedRecordOpts` so the existing
 * `prediction-v1-auto` factory can be registered without an adapter shim.
 */
export interface TaskGeneratorFactoryDeps {
  recordRef: { current: LaunchedSolverNetRecord };
  configRef: { current: PredictionV1GeneratorRuntimeConfig };
  staticConfig?: PredictionV1GeneratorStaticConfig;
}

/**
 * A factory that returns a tick callable. Today the only generator type is
 * `PredictionV1GeneratorTick`; future kinds will share this signature so the
 * launcher's main loop can poll them uniformly.
 */
export type TaskGeneratorFactory = (deps: TaskGeneratorFactoryDeps) => PredictionV1GeneratorTick;

/**
 * Registry of `implementation` string → factory. Keyed off the BINDING
 * pointer the manifest declares. Lookup is exact-match — no globbing, no
 * version-resolution magic. If two manifests advertise the same
 * implementation string, they get the same factory.
 */
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

/**
 * Default registry pre-loaded with prediction.v1's auto-generator. The
 * implementation string matches what
 * `PREDICTION_V1_SOLVER_NET_CONTRACT.taskGenerator.implementation` declares
 * (see `packages/sdk/src/contracts.ts`).
 */
export function createDefaultTaskGeneratorRegistry(): TaskGeneratorRegistry {
  const registry = new TaskGeneratorRegistry();
  registry.register(
    'client/src/solver-types/prediction-v1-auto',
    makePredictionV1GeneratorForLaunchedRecord,
  );
  return registry;
}
