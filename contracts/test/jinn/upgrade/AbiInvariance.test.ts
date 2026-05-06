/**
 * abi-invariance — pinned canonical signatures for TaskCoordinator + JinnRouterV3.
 *
 * Background: this file enforces stable selectors / topic hashes for the
 * subgraph-indexed surface. Two cutovers have happened:
 *   - 217cb804: cosmetic rename solverTypeDigest -> manifestDigest. Names
 *     are not part of selectors/topics, so signatures were unchanged.
 *   - Stage 1 (2026-05): EvaluationPolicy refactor — replaced
 *     `evaluationDeadline (uint64)` with
 *     `evaluationDuration (uint64) + externalReadyAt (uint64)`. The
 *     TaskPolicy tuple grew by one uint64 in the nested EvaluationPolicy,
 *     and TaskCreated emits one extra trailing uint64. This is a planned
 *     breaking ABI change; subgraph schema + SDK encoders updated in the
 *     same series.
 *
 * The pinned signatures below reflect the *current* canonical wire
 * format. If a test in this file fails, the type changed unintentionally
 * — either revert the change or update the pin in the same PR with the
 * same propagation step.
 *
 * Not gated; runs on every `yarn test`.
 */

import { expect } from 'chai';
import { Interface, id, keccak256, toUtf8Bytes } from 'ethers';
import { artifacts } from 'hardhat';

// Canonical signatures (post-Stage-1). The TaskPolicy tuple expands to
//   (uint64,uint64,uint64,uint32,uint16,uint16,address,
//     (uint16,uint16,uint64,uint64,uint16,bool))
// where the trailing nested tuple is EvaluationPolicy with its new shape:
//   (requiredVerdicts, passThreshold, evaluationDuration, externalReadyAt,
//    maxVerdictsPerEvaluator, disallowSolverSelfEvaluation).
const CANONICAL = {
  // TaskCoordinator.createTask(address, bytes32, bytes32, TaskPolicy)
  taskCoordinatorCreateTask:
    'createTask(address,bytes32,bytes32,(uint64,uint64,uint64,uint32,uint16,uint16,address,(uint16,uint16,uint64,uint64,uint16,bool)))',

  // JinnRouterV3.createTask(bytes32, bytes32, TaskPolicy,
  //   uint256, uint256, uint256)
  routerV3CreateTask:
    'createTask(bytes32,bytes32,(uint64,uint64,uint64,uint32,uint16,uint16,address,(uint16,uint16,uint64,uint64,uint16,bool)),uint256,uint256,uint256)',

  // TaskCoordinator.TaskCreated(uint256 indexed, address indexed,
  //   bytes32 indexed, bytes32, uint16, uint16, uint64, uint64, uint64,
  //   uint64 (evaluationDuration), uint64 (externalReadyAt))
  taskCoordinatorTaskCreated:
    'TaskCreated(uint256,address,bytes32,bytes32,uint16,uint16,uint64,uint64,uint64,uint64,uint64)',

  // JinnRouterV3.TaskCreated unchanged across both cutovers.
  routerV3TaskCreated:
    'TaskCreated(address,uint256,bytes32,bytes32,uint16,uint16,uint256,uint256)',
};

function selectorOf(signature: string): string {
  return keccak256(toUtf8Bytes(signature)).slice(0, 10);
}

// ── Full-surface event invariance ─────────────────────────────────────────
//
// The `*CreateTask` selector and `*TaskCreated` topic0 above were sufficient
// when only the headline rename was at risk. The lists below extend the
// regression guard to every event emitted by both contracts so a future PR
// that retypes ANY param (whether or not it touches manifestDigest) fails
// loudly. Function selectors beyond `createTask` are not enumerated here:
// they have the same Solidity-language guarantee, and `createTask`'s pin
// already demonstrates the property — adding the rest would be belt-and-
// braces for marginal value.
//
// Signatures sourced from `git show 217cb804^:contracts/src/...`. Param
// names omitted (the EVM does not see them).
const TASK_COORDINATOR_EVENTS: Array<readonly [string, string]> = [
  ['Initialized',                  'Initialized(address,address)'],
  ['OwnershipTransferred',         'OwnershipTransferred(address,address)'],
  ['AuthorizedRouterUpdated',      'AuthorizedRouterUpdated(address,address)'],
  ['TaskCreated',                  CANONICAL.taskCoordinatorTaskCreated],
  ['TaskClaimed',                  'TaskClaimed(uint256,uint32,address,uint64)'],
  ['TaskAttemptRequestRegistered', 'TaskAttemptRequestRegistered(uint256,uint32,bytes32)'],
  ['TaskSubmitted',                'TaskSubmitted(uint256,uint32,address,bytes32,bytes32,uint256)'],
  ['EvaluationClaimed',            'EvaluationClaimed(uint256,uint32,uint32,address,uint64)'],
  ['VerdictRequestRegistered',     'VerdictRequestRegistered(uint256,uint32,uint32,bytes32)'],
  ['VerdictDelivered',             'VerdictDelivered(uint256,uint32,uint32,address,bytes32,uint8)'],
  ['AttemptFinalized',             'AttemptFinalized(uint256,uint32,bool,uint16,uint16)'],
  ['TaskCreationCreditLocked',     'TaskCreationCreditLocked(uint256,address,uint256)'],
  ['TaskAttemptExpired',           'TaskAttemptExpired(uint256,uint32,address)'],
];

const ROUTER_V3_EVENTS: Array<readonly [string, string]> = [
  ['Initialized',                  'Initialized(address,address,address,address)'],
  ['OwnershipTransferred',         'OwnershipTransferred(address,address)'],
  ['TaskCreated',                  CANONICAL.routerV3TaskCreated],
  ['TaskAttemptCreated',           'TaskAttemptCreated(uint256,uint32,bytes32,address,address,uint256)'],
  ['EvaluationAttemptCreated',     'EvaluationAttemptCreated(uint256,uint32,uint32,bytes32,address,address,uint256)'],
  ['SolutionDeliveryClaimed',      'SolutionDeliveryClaimed(address,bytes32,uint256,uint32)'],
  ['VerdictDeliveryClaimed',       'VerdictDeliveryClaimed(address,bytes32,uint256,uint32,uint32,uint8)'],
  ['TaskBudgetRefunded',           'TaskBudgetRefunded(uint256,address,uint256,uint256)'],
];

describe('abi-invariance — pinned canonical signatures', function () {
  // Loading artifacts from the hardhat cache is cheap, but we keep a
  // generous timeout in case the suite runs cold.
  this.timeout(30_000);

  describe('TaskCoordinator', () => {
    let iface: Interface;
    before(async () => {
      const artifact = await artifacts.readArtifact('TaskCoordinator');
      iface = new Interface(artifact.abi);
    });

    it('createTask selector unchanged', () => {
      const expected = selectorOf(CANONICAL.taskCoordinatorCreateTask);
      const fn = iface.getFunction('createTask');
      if (!fn) throw new Error('createTask not found in post-cutover TaskCoordinator ABI');
      expect(fn.selector).to.equal(
        expected,
        `selector drift: post-cutover TaskCoordinator.createTask = ${fn.selector}, ` +
          `canonical signature ${CANONICAL.taskCoordinatorCreateTask} = ${expected}. ` +
          `The EvaluationPolicy refactor changed types intentionally; further drift means another type changed.`,
      );
    });

    for (const [eventName, preRenameSig] of TASK_COORDINATOR_EVENTS) {
      it(`${eventName} topic0 unchanged`, () => {
        const expected = id(preRenameSig);
        const ev = iface.getEvent(eventName);
        if (!ev) throw new Error(`${eventName} not found in post-cutover TaskCoordinator ABI`);
        expect(ev.topicHash).to.equal(
          expected,
          `topic0 drift: post-cutover TaskCoordinator.${eventName} = ${ev.topicHash}, ` +
            `canonical signature ${preRenameSig} = ${expected}. ` +
            `Subgraph eventHandlers key off topic0 — drift unwires the indexer.`,
        );
      });
    }
  });

  describe('JinnRouterV3', () => {
    let iface: Interface;
    before(async () => {
      const artifact = await artifacts.readArtifact('JinnRouterV3');
      iface = new Interface(artifact.abi);
    });

    it('createTask selector unchanged', () => {
      const expected = selectorOf(CANONICAL.routerV3CreateTask);
      const fn = iface.getFunction('createTask');
      if (!fn) throw new Error('createTask not found in post-cutover JinnRouterV3 ABI');
      expect(fn.selector).to.equal(
        expected,
        `selector drift: post-cutover JinnRouterV3.createTask = ${fn.selector}, ` +
          `canonical signature ${CANONICAL.routerV3CreateTask} = ${expected}. ` +
          `Subgraph mappings + SDK encoders depend on selector stability.`,
      );
    });

    for (const [eventName, preRenameSig] of ROUTER_V3_EVENTS) {
      it(`${eventName} topic0 unchanged`, () => {
        const expected = id(preRenameSig);
        const ev = iface.getEvent(eventName);
        if (!ev) throw new Error(`${eventName} not found in post-cutover JinnRouterV3 ABI`);
        expect(ev.topicHash).to.equal(
          expected,
          `topic0 drift: post-cutover JinnRouterV3.${eventName} = ${ev.topicHash}, ` +
            `canonical signature ${preRenameSig} = ${expected}. ` +
            `Subgraph eventHandlers key off topic0 — drift unwires the indexer.`,
        );
      });
    }
  });
});
