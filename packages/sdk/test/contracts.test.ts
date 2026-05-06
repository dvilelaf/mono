// Surface tests for the SolverNet contract template (`SolverNetContract`).
//
// Task 6 of `spec/2026-05-05-solvernet-creation-and-launch.md`:
// - `SolverNetContract` exposes `id` + `version` (alongside the legacy
//   `solverType` field, which Task 30 removes).
// - `defaultRuntimePlugins` is gone from both the interface and the
//   `PREDICTION_V1_SOLVER_NET_CONTRACT` template.
// - The schemas block exposes both Zod (daemon-side validation ergonomics)
//   and JSON Schema (canonical wire format embedded in manifests).
// - The template projects cleanly into a SolverNetManifestV1 contract block
//   so launchers can seed drafts from it.
import { describe, expect, it } from 'vitest';
import {
  PREDICTION_V1_SOLVER_NET_CONTRACT,
  SOLVER_NET_CONTRACTS,
  getSolverNetContract,
  type SolverNetContract,
} from '../src/contracts.js';
import {
  SolverNetManifestV1Schema,
  validateSolverNetManifest,
  type SolverNetManifestV1,
} from '../src/solvernets/manifest-schema.js';

describe('SolverNetContract surface (Task 6)', () => {
  it('PREDICTION_V1 populates id and version', () => {
    expect(PREDICTION_V1_SOLVER_NET_CONTRACT.id).toBe('prediction');
    expect(PREDICTION_V1_SOLVER_NET_CONTRACT.version).toBe('v1');
  });

  it('keeps legacy solverType during migration (Task 8 migrates read sites; Task 30 removes)', () => {
    expect(PREDICTION_V1_SOLVER_NET_CONTRACT.solverType).toBe('prediction.v1');
    // solverType is the dot-join of id/version — derived but still present.
    expect(`${PREDICTION_V1_SOLVER_NET_CONTRACT.id}.${PREDICTION_V1_SOLVER_NET_CONTRACT.version}`).toBe(
      PREDICTION_V1_SOLVER_NET_CONTRACT.solverType,
    );
  });

  it('does not carry defaultRuntimePlugins (operator-side concern)', () => {
    expect(PREDICTION_V1_SOLVER_NET_CONTRACT as Record<string, unknown>).not.toHaveProperty(
      'defaultRuntimePlugins',
    );
  });

  it('schemas block exposes both Zod and JSON Schema', () => {
    const { task, solution, verdict } = PREDICTION_V1_SOLVER_NET_CONTRACT.schemas;
    for (const block of [task, solution, verdict]) {
      expect(block).toHaveProperty('zod');
      expect(block).toHaveProperty('json');
      // Zod: must round-trip via safeParse.
      expect(typeof block.zod.safeParse).toBe('function');
      // JSON Schema: must be a plain JSON-serializable object.
      expect(typeof block.json).toBe('object');
      expect(block.json).not.toBeNull();
      const reparsed = JSON.parse(JSON.stringify(block.json));
      expect(reparsed).toEqual(block.json);
    }
  });

  it('json-form schemas are produced from the matching zod schema', () => {
    // task.json should be the JSON Schema serialization of task.zod (object).
    const taskJson = PREDICTION_V1_SOLVER_NET_CONTRACT.schemas.task.json;
    expect(taskJson.type).toBe('object');
  });

  it('SOLVER_NET_CONTRACTS still keys by legacy SolverType during migration', () => {
    expect(SOLVER_NET_CONTRACTS['prediction.v1']).toBe(PREDICTION_V1_SOLVER_NET_CONTRACT);
    expect(getSolverNetContract('prediction.v1')).toBe(PREDICTION_V1_SOLVER_NET_CONTRACT);
  });

  it('payload validation continues to work via the zod side of schemas', () => {
    // The internal validateWithSchema path uses the zod schema; sanity-check
    // that this keeps functioning end-to-end through getSolverNetContract.
    const contract = getSolverNetContract('prediction.v1') as SolverNetContract;
    expect(contract.schemas.task.zod.safeParse(null).success).toBe(false);
  });
});

describe('PREDICTION_V1_SOLVER_NET_CONTRACT projects into a SolverNetManifestV1 (Phase 1 dependency)', () => {
  it('round-trips through manifestSchema with all derived fields populated', () => {
    const c = PREDICTION_V1_SOLVER_NET_CONTRACT;

    // Build a minimal-but-valid manifest using only fields derived from the
    // SDK contract template plus launcher metadata that the SPA contributes
    // at launch time. The point of this test is to prove the SDK contract's
    // shape is compatible with the manifest contract block.
    const manifest: SolverNetManifestV1 = {
      schemaVersion: 'solvernet.manifest.v1',
      solverNetId: 'prediction-2026-05-06',
      network: 'base-sepolia',
      name: c.name,
      description: 'Calibrated probability forecasts for prediction-market events.',
      launcher: {
        safeAddress: '0xE64bAf0000000000000000000000000000000000',
        agentEoa: '0x1111111111111111111111111111111111111111',
        agentId: '5474',
      },
      contract: {
        id: c.id,
        version: c.version,
        schemas: {
          task: c.schemas.task.json,
          solution: c.schemas.solution.json,
          verdict: c.schemas.verdict.json,
        },
        // Manifest schema demands `'parallel' | 'serial'` — the SDK template
        // currently uses `'parallel'`, which lines up. Other modes will need
        // an SDK-side update before they can be projected into a manifest.
        claimPolicyDefaults: {
          mode: c.claimPolicyDefaults.mode as 'parallel' | 'serial',
          maxClaims: c.claimPolicyDefaults.maxClaims,
          maxClaimsPerOperator: c.claimPolicyDefaults.maxClaimsPerOperator,
          claimLeaseTtlSeconds: c.claimPolicyDefaults.claimLeaseTtlSeconds,
        },
        credentialRequirements: c.credentialRequirements,
        evaluationFunction: {
          id: c.evaluationFunction.id,
          deterministic: c.evaluationFunction.deterministic,
          inputs: [...c.evaluationFunction.inputs],
          output: c.evaluationFunction.output,
          implementation: c.evaluationFunction.implementation,
        },
        aggregationFunction: {
          id: c.aggregationFunction.id,
          deterministic: c.aggregationFunction.deterministic,
          inputs: [...c.aggregationFunction.inputs],
          output: c.aggregationFunction.output,
          ...(c.aggregationFunction.windowDays !== undefined
            ? { windowDays: c.aggregationFunction.windowDays }
            : {}),
        },
      },
      solutionPriceWei: '1000000000000000',
      verdictPriceWei: '500000000000000',
      openRoles: ['solver', 'evaluator'],
      createdAt: '2026-05-06T00:00:00.000Z',
      launchedAt: '2026-05-06T00:00:00.000Z',
      signature: {
        alg: 'eip-191',
        signer: '0x1111111111111111111111111111111111111111',
        value: ('0x' + 'ab'.repeat(65)) as `0x${string}`,
      },
    };

    const result = validateSolverNetManifest(manifest);
    if (!result.ok) {
      throw new Error(`Expected manifest to validate; issues: ${JSON.stringify(result.issues)}`);
    }
    expect(result.ok).toBe(true);

    // Belt-and-braces: parse direct against the schema too.
    const direct = SolverNetManifestV1Schema.safeParse(manifest);
    expect(direct.success).toBe(true);
  });
});
