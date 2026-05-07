/**
 * Task-first end-to-end validation.
 *
 * Public command: `yarn e2e`
 *
 * Clean-break lifecycle:
 *   Task -> claim Task -> internal Mech requestId -> submit Solution
 *   -> claim evaluation -> internal Mech verdictRequestId -> submit Verdict
 *   -> attempt finalized -> activity counted.
 */

import {
  runBaseSepoliaForkTaskFirstFullLoop,
  runContractIntegration,
  runAnvilTaskFirstFullLoop,
  runFreezeFenceForkE2E,
  runLocalTaskFirstLifecycle,
  runPhase,
  runPredictionV1Smoke,
  runTrainVsFrozenTrajectoryE2E,
  summarize,
} from './task-first-helpers.js';

async function main(): Promise<void> {
  const results = [];

  results.push(await runPhase('Prediction v1 schema smoke', async () => {
    await runPredictionV1Smoke();
  }));

  results.push(await runPhase('Client Task-first lifecycle', async () => {
    const result = await runLocalTaskFirstLifecycle();
    process.stdout.write(
      `taskId=${result.postedTaskId} requestIds=${result.request.requestId},${result.secondRequest.requestId} ` +
      `verdictRequest=${result.verdictRequest.requestId} verdict=${result.verdict} score=${result.score}\n`,
    );
  }));

  if (process.env['JINN_E2E_SKIP_FORK'] === '1') {
    process.stdout.write('\n--- Base Sepolia fork Task-first full loop ---\nskipped by JINN_E2E_SKIP_FORK=1; running local Anvil smoke instead\n');
    results.push(await runPhase('Local Anvil Task-first full loop with evaluator', async () => {
      const result = await runAnvilTaskFirstFullLoop();
      process.stdout.write(
        `taskId=${result.taskId} attempts=${result.attempts.map((a) => `${a.attemptIndex}:${a.requestId}`).join(',')} ` +
        `verdict=${result.verdict} score=${result.score} submitted=${result.submittedCount}\n`,
      );
    }));
  } else {
    results.push(await runPhase('Base Sepolia fork Task-first full loop with real Mech', async () => {
      const result = await runBaseSepoliaForkTaskFirstFullLoop();
      process.stdout.write(
        `taskId=${result.taskId} attempts=${result.attempts.map((a) => `${a.attemptIndex}:${a.requestId}`).join(',')} ` +
        `verdict=${result.verdict} score=${result.score} submitted=${result.submittedCount}\n`,
      );
    }));
  }

  // Freeze-fence phases use plain local Anvil (no Base Sepolia RPC needed),
  // so they run even under JINN_E2E_SKIP_FORK=1 — they only require the
  // `anvil` binary, like `runAnvilTaskFirstFullLoop`.
  results.push(await runPhase('Anvil-fork freeze-fence e2e (stable digest, mutation detected, rollback)', async () => {
    const result = await runFreezeFenceForkE2E();
    process.stdout.write(
      `rpcUrl=${result.rpcUrl} ` +
      `digestStable=${result.codeDigestRun1 === result.codeDigestRun2} ` +
      `violationHarness=${result.violationHarnessName} ` +
      `rollbackOk=${result.preViolationHash === result.postViolationHash}\n`,
    );
  }));

  results.push(await runPhase('Anvil-fork train-vs-frozen trajectory e2e (improve/memory gating)', async () => {
    const result = await runTrainVsFrozenTrajectoryE2E();
    process.stdout.write(
      `rpcUrl=${result.rpcUrl} ` +
      `train=[${result.trainPhaseSpans.join(',')}] ` +
      `frozen=[${result.frozenPhaseSpans.join(',')}]\n`,
    );
  }));

  if (process.env['JINN_E2E_SKIP_CONTRACTS'] === '1') {
    process.stdout.write('\n--- TaskCoordinator/JinnRouterV3 contract integration ---\nskipped by JINN_E2E_SKIP_CONTRACTS=1\n');
  } else {
    results.push(await runPhase('TaskCoordinator/JinnRouterV3 contract integration', async () => {
      await runContractIntegration();
    }));
  }

  summarize(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
