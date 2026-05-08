import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskGenerator } from '../tasks/sources.js';
import type { PredictionV1GeneratorRuntimeConfig } from '../solver-types/prediction-v1-auto.js';
import type {
  MakeSweRebenchV2GeneratorForLaunchedRecordOpts,
  SweRebenchV2GeneratorRuntimeConfig,
} from '../solver-types/swe-rebench-v2.js';
import type { PendingGeneratorSpawn } from './daemon-init.js';
import type { LaunchedSolverNetRecord } from './store.js';

export interface LaunchedRecordContractRef {
  id: string;
  version: string;
  solverType: string;
  source: 'manifest' | 'solverNetId';
}

export interface LaunchedRecordGeneratorStaticConfig {
  agentEoa?: `0x${string}`;
  safeAddress?: `0x${string}`;
  agentPrivateKey?: `0x${string}`;
}

export interface LaunchedRecordGeneratorFactories {
  predictionV1: (opts: {
    recordRef: { current: LaunchedSolverNetRecord };
    configRef: { current: PredictionV1GeneratorRuntimeConfig };
    staticConfig?: LaunchedRecordGeneratorStaticConfig;
  }) => TaskGenerator;
  sweRebenchV2: (opts: MakeSweRebenchV2GeneratorForLaunchedRecordOpts) => TaskGenerator;
}

export interface LaunchedRecordGeneratorLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
}

export interface WireLaunchedRecordGeneratorsOpts {
  pendingGenerators: PendingGeneratorSpawn[];
  staticConfig: LaunchedRecordGeneratorStaticConfig;
  launchedDir?: string;
  factories?: LaunchedRecordGeneratorFactories;
  logger?: LaunchedRecordGeneratorLogger;
}

export interface WiredLaunchedRecordGenerator {
  solverType: string;
  generator: TaskGenerator;
}

export interface WireLaunchedRecordGeneratorsResult {
  generators: WiredLaunchedRecordGenerator[];
  predictionGeneratorRef?: TaskGenerator;
}

function solverTypeFor(id: string, version: string): string {
  return `${id}.${version}`;
}

export function resolveContractFromSolverNetId(
  solverNetId: string,
): LaunchedRecordContractRef | null {
  const match = /^[^_]+_(.+)_[^_]+$/u.exec(solverNetId);
  const contractAndVersion = match?.[1];
  if (!contractAndVersion) return null;
  const splitAt = contractAndVersion.lastIndexOf('-');
  if (splitAt <= 0 || splitAt === contractAndVersion.length - 1) return null;
  const id = contractAndVersion.slice(0, splitAt);
  const version = contractAndVersion.slice(splitAt + 1);
  return {
    id,
    version,
    solverType: solverTypeFor(id, version),
    source: 'solverNetId',
  };
}

function contractFromManifest(raw: unknown): LaunchedRecordContractRef | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const manifest = raw as { contract?: { id?: unknown; version?: unknown } };
  const id = manifest.contract?.id;
  const version = manifest.contract?.version;
  if (typeof id !== 'string' || typeof version !== 'string') return null;
  if (!id || !version) return null;
  return {
    id,
    version,
    solverType: solverTypeFor(id, version),
    source: 'manifest',
  };
}

async function tryReadManifestContract(path: string): Promise<LaunchedRecordContractRef | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return contractFromManifest(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function resolveLaunchedRecordContract(
  record: LaunchedSolverNetRecord,
  opts: { launchedDir?: string } = {},
): Promise<LaunchedRecordContractRef | null> {
  const manifestPaths = [
    record.manifestPath,
    opts.launchedDir ? join(opts.launchedDir, `${record.solverNetId}.manifest.json`) : undefined,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  for (const manifestPath of manifestPaths) {
    const fromManifest = await tryReadManifestContract(manifestPath);
    if (fromManifest) return fromManifest;
  }

  return resolveContractFromSolverNetId(record.solverNetId);
}

async function defaultFactories(): Promise<LaunchedRecordGeneratorFactories> {
  const [
    { makePredictionV1GeneratorForLaunchedRecord },
    { makeSweRebenchV2GeneratorForLaunchedRecord },
  ] = await Promise.all([
    import('../solver-types/prediction-v1-auto.js'),
    import('../solver-types/swe-rebench-v2.js'),
  ]);
  return {
    predictionV1: makePredictionV1GeneratorForLaunchedRecord,
    sweRebenchV2: makeSweRebenchV2GeneratorForLaunchedRecord,
  };
}

function hasGetState(generator: TaskGenerator): boolean {
  return typeof (generator as { getState?: unknown }).getState === 'function';
}

export async function wireLaunchedRecordGenerators(
  opts: WireLaunchedRecordGeneratorsOpts,
): Promise<WireLaunchedRecordGeneratorsResult> {
  const factories = opts.factories ?? await defaultFactories();
  const logger = opts.logger ?? {};
  const generators: WiredLaunchedRecordGenerator[] = [];
  let predictionGeneratorRef: TaskGenerator | undefined;

  for (const pending of opts.pendingGenerators) {
    const contract = await resolveLaunchedRecordContract(pending.record, {
      launchedDir: opts.launchedDir,
    });
    if (!contract) {
      logger.warn?.(
        `[main] launched-record generator skipped: ${pending.record.solverNetId} ` +
          '(could not resolve contract id/version)',
      );
      continue;
    }

    let generator: TaskGenerator | undefined;
    if (contract.id === 'prediction' && contract.version === 'v1') {
      generator = factories.predictionV1({
        recordRef: pending.recordRef,
        configRef: pending.configRef as { current: PredictionV1GeneratorRuntimeConfig },
        staticConfig: opts.staticConfig,
      });
      if (!predictionGeneratorRef && hasGetState(generator)) {
        predictionGeneratorRef = generator;
      }
    } else if (contract.id === 'swe-rebench-v2' && contract.version === 'v1') {
      generator = factories.sweRebenchV2({
        recordRef: pending.recordRef,
        configRef: pending.configRef as { current: SweRebenchV2GeneratorRuntimeConfig },
        staticConfig: opts.staticConfig,
      });
    } else {
      logger.warn?.(
        `[main] launched-record generator skipped: ${pending.record.solverNetId} ` +
          `(${contract.id}.${contract.version} is not supported by this daemon)`,
      );
      continue;
    }

    generators.push({ solverType: contract.solverType, generator });
    logger.info?.(
      `[main] launched-record generator wired: ${pending.record.solverNetId} ` +
        `(${contract.id}.${contract.version}, status=${pending.record.status})`,
    );
  }

  return { generators, predictionGeneratorRef };
}
