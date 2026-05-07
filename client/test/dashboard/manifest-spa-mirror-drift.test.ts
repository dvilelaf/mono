// Drift-catcher between the SDK's canonical `PREDICTION_V1_SOLVER_NET_CONTRACT`
// and the SPA wizard's manual mirror in `templates.ts`.
//
// The SPA's tsconfig only includes `client/src/dashboard/spa/src/**`, so the
// wizard can't `import` directly from `@jinn-network/sdk`. Instead the
// wizard ships a hand-copied template (per the deliberate decision documented
// in `templates.ts`). This file lives outside the SPA's tsconfig boundary
// and CAN import both — it pins the manual mirror to the SDK so divergence
// is caught at test time rather than producing inconsistent task fixtures
// across operator deployments.
//
// Add a new assertion here whenever you add a new mirrored field; the SDK
// is the source of truth.

import { describe, expect, it } from 'vitest';
import { PREDICTION_V1_SOLVER_NET_CONTRACT } from '@jinn-network/sdk/solvernets';
import { PREDICTION_V1_TEMPLATE } from '../../src/dashboard/spa/src/pages/launcher-create/templates.js';

describe('SPA wizard template mirrors the SDK manifest (drift guard)', () => {
  it('id and version match', () => {
    expect(PREDICTION_V1_TEMPLATE.id).toBe(PREDICTION_V1_SOLVER_NET_CONTRACT.id);
    expect(PREDICTION_V1_TEMPLATE.version).toBe(PREDICTION_V1_SOLVER_NET_CONTRACT.version);
  });

  it('taskGenerator is identical to the SDK binding pointer', () => {
    expect(PREDICTION_V1_TEMPLATE.taskGenerator).toEqual(
      PREDICTION_V1_SOLVER_NET_CONTRACT.taskGenerator,
    );
  });

  it('generatorDefaults.submissionWindowMs derives from solver.submissionWindowSeconds * 1000', () => {
    expect(PREDICTION_V1_TEMPLATE.generatorDefaults.submissionWindowMs).toBe(
      PREDICTION_V1_SOLVER_NET_CONTRACT.claimPolicy.solver.submissionWindowSeconds * 1000,
    );
  });

  it('claimPolicy.solver shape mirrors the SDK', () => {
    const sdkSolver = PREDICTION_V1_SOLVER_NET_CONTRACT.claimPolicy.solver;
    const tplSolver = PREDICTION_V1_TEMPLATE.claimPolicy.solver;
    expect(tplSolver.mode).toBe(sdkSolver.mode);
    expect(tplSolver.maxClaims).toBe(sdkSolver.maxClaims);
    expect(tplSolver.maxClaimsPerOperator).toBe(sdkSolver.maxClaimsPerOperator);
    expect(tplSolver.claimLeaseTtlSeconds).toBe(sdkSolver.claimLeaseTtlSeconds);
    expect(tplSolver.submissionWindowSeconds).toBe(sdkSolver.submissionWindowSeconds);
  });

  it('claimPolicy.evaluator shape mirrors the SDK (preconditions + window)', () => {
    const sdkEval = PREDICTION_V1_SOLVER_NET_CONTRACT.claimPolicy.evaluator;
    const tplEval = PREDICTION_V1_TEMPLATE.claimPolicy.evaluator;
    expect(tplEval.requiredVerdicts).toBe(sdkEval.requiredVerdicts);
    expect(tplEval.passThreshold).toBe(sdkEval.passThreshold);
    expect(tplEval.maxVerdictsPerEvaluator).toBe(sdkEval.maxVerdictsPerEvaluator);
    expect(tplEval.window).toEqual(sdkEval.window);
    expect(tplEval.preconditions).toEqual(sdkEval.preconditions);
  });
});
