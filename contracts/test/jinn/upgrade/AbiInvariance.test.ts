/**
 * abi-invariance — manifestDigest rename was cosmetic at the wire level.
 *
 * Background: commit 217cb804 renamed `solverTypeDigest` to `manifestDigest`
 * across TaskCoordinator and JinnRouterV3. Function selectors and event
 * topic hashes are computed from parameter *types* (not names), so the
 * rename should not have changed any selector or topic. This test enforces
 * that invariant by hardcoding the pre-rename canonical signatures
 * (sourced from `git show 217cb804^:contracts/src/...`) and asserting the
 * post-rename ABI produces identical hashes.
 *
 * If a test in this file fails, the rename accidentally changed a TYPE
 * (or the signature changed for some other reason). Either revert the
 * type change or treat it as a breaking ABI change and update consumers
 * (subgraph schema, SDK encoders, off-chain indexers) in the same PR.
 *
 * Not gated; runs on every `yarn test`.
 */

import { expect } from 'chai';
import { Interface, id, keccak256, toUtf8Bytes } from 'ethers';
import { artifacts } from 'hardhat';

// Canonical pre-rename signatures from git@217cb804^:
//   contracts/src/tasks/TaskCoordinator.sol
//   contracts/src/staking/JinnRouterV3.sol
//
// Param names are deliberately omitted — the EVM does not see them, only
// types contribute to the selector / topic hash. The TaskPolicy tuple
// expands to (uint64,uint64,uint64,uint32,uint16,uint16,address,
//             (uint16,uint16,uint64,uint16,bool))
// where the trailing nested tuple is EvaluationPolicy.
const PRE_RENAME = {
  // TaskCoordinator.createTask(address creator, bytes32 taskCidDigest,
  //   bytes32 solverTypeDigest, TaskPolicy calldata policy)
  taskCoordinatorCreateTask:
    'createTask(address,bytes32,bytes32,(uint64,uint64,uint64,uint32,uint16,uint16,address,(uint16,uint16,uint64,uint16,bool)))',

  // JinnRouterV3.createTask(bytes32 taskCidDigest, bytes32 solverTypeDigest,
  //   TaskCoordinator.TaskPolicy calldata policy,
  //   uint256 solutionMaxDeliveryRate, uint256 verdictMaxDeliveryRate,
  //   uint256 responseTimeout)
  routerV3CreateTask:
    'createTask(bytes32,bytes32,(uint64,uint64,uint64,uint32,uint16,uint16,address,(uint16,uint16,uint64,uint16,bool)),uint256,uint256,uint256)',

  // TaskCoordinator.TaskCreated(uint256 indexed taskId, address indexed creator,
  //   bytes32 indexed solverTypeDigest, bytes32 taskCidDigest,
  //   uint16 maxClaims, uint16 requiredVerdicts,
  //   uint64 claimWindowStart, uint64 claimWindowEnd,
  //   uint64 submissionDeadline, uint64 evaluationDeadline)
  taskCoordinatorTaskCreated:
    'TaskCreated(uint256,address,bytes32,bytes32,uint16,uint16,uint64,uint64,uint64,uint64)',

  // JinnRouterV3.TaskCreated(address indexed creator, uint256 indexed taskId,
  //   bytes32 indexed solverTypeDigest, bytes32 taskCidDigest,
  //   uint16 maxClaims, uint16 requiredVerdicts,
  //   uint256 solutionBudget, uint256 verdictBudget)
  routerV3TaskCreated:
    'TaskCreated(address,uint256,bytes32,bytes32,uint16,uint16,uint256,uint256)',
};

function selectorOf(signature: string): string {
  return keccak256(toUtf8Bytes(signature)).slice(0, 10);
}

describe('abi-invariance — manifestDigest rename was cosmetic', function () {
  // Loading artifacts from the hardhat cache is cheap, but we keep a
  // generous timeout in case the suite runs cold.
  this.timeout(30_000);

  it('TaskCoordinator.createTask selector unchanged', async () => {
    const expected = selectorOf(PRE_RENAME.taskCoordinatorCreateTask);
    const artifact = await artifacts.readArtifact('TaskCoordinator');
    const iface = new Interface(artifact.abi);
    const fn = iface.getFunction('createTask');
    if (!fn) throw new Error('createTask not found in post-rename TaskCoordinator ABI');
    expect(fn.selector).to.equal(
      expected,
      `selector drift: post-rename TaskCoordinator.createTask = ${fn.selector}, ` +
        `pre-rename signature ${PRE_RENAME.taskCoordinatorCreateTask} = ${expected}. ` +
        `The manifestDigest rename should be cosmetic — a selector change means a TYPE changed.`,
    );
  });

  it('JinnRouterV3.createTask selector unchanged', async () => {
    const expected = selectorOf(PRE_RENAME.routerV3CreateTask);
    const artifact = await artifacts.readArtifact('JinnRouterV3');
    const iface = new Interface(artifact.abi);
    const fn = iface.getFunction('createTask');
    if (!fn) throw new Error('createTask not found in post-rename JinnRouterV3 ABI');
    expect(fn.selector).to.equal(
      expected,
      `selector drift: post-rename JinnRouterV3.createTask = ${fn.selector}, ` +
        `pre-rename signature ${PRE_RENAME.routerV3CreateTask} = ${expected}. ` +
        `Subgraph mappings + SDK encoders depend on selector stability.`,
    );
  });

  it('TaskCoordinator.TaskCreated topic0 unchanged', async () => {
    const expected = id(PRE_RENAME.taskCoordinatorTaskCreated);
    const artifact = await artifacts.readArtifact('TaskCoordinator');
    const iface = new Interface(artifact.abi);
    const ev = iface.getEvent('TaskCreated');
    if (!ev) throw new Error('TaskCreated not found in post-rename TaskCoordinator ABI');
    expect(ev.topicHash).to.equal(
      expected,
      `topic0 drift: post-rename TaskCoordinator.TaskCreated = ${ev.topicHash}, ` +
        `pre-rename signature ${PRE_RENAME.taskCoordinatorTaskCreated} = ${expected}. ` +
        `Subgraph eventHandlers key off topic0 — drift unwires the indexer.`,
    );
  });

  it('JinnRouterV3.TaskCreated topic0 unchanged', async () => {
    const expected = id(PRE_RENAME.routerV3TaskCreated);
    const artifact = await artifacts.readArtifact('JinnRouterV3');
    const iface = new Interface(artifact.abi);
    const ev = iface.getEvent('TaskCreated');
    if (!ev) throw new Error('TaskCreated not found in post-rename JinnRouterV3 ABI');
    expect(ev.topicHash).to.equal(
      expected,
      `topic0 drift: post-rename JinnRouterV3.TaskCreated = ${ev.topicHash}, ` +
        `pre-rename signature ${PRE_RENAME.routerV3TaskCreated} = ${expected}. ` +
        `Subgraph eventHandlers key off topic0 — drift unwires the indexer.`,
    );
  });
});
