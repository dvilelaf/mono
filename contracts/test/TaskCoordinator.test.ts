import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("TaskCoordinator", function () {
  const TASK_CID = ethers.keccak256(ethers.toUtf8Bytes("task-cid"));
  const SOLVER_TYPE = ethers.keccak256(ethers.toUtf8Bytes("prediction.v1"));
  const REQUEST_ID = ethers.keccak256(ethers.toUtf8Bytes("solution-request-1"));
  const VERDICT_REQUEST_ID = ethers.keccak256(ethers.toUtf8Bytes("verdict-request-1"));
  const VERDICT_REQUEST_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("verdict-request-2"));
  const SOLUTION_CID = ethers.keccak256(ethers.toUtf8Bytes("solution-1"));
  const VERDICT_CID = ethers.keccak256(ethers.toUtf8Bytes("verdict-1"));
  const VERDICT_CID_2 = ethers.keccak256(ethers.toUtf8Bytes("verdict-2"));

  const VERDICT_PASS = 1;
  const VERDICT_FAIL = 2;
  const VERDICT_INVALID = 3;
  const VERDICT_UNRESOLVED = 4;

  async function deploy() {
    const [owner, router, creator, operator, evaluator, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TaskCoordinator");
    const coordinator = await Factory.deploy();
    await coordinator.waitForDeployment();
    await (await coordinator.initialize(await owner.getAddress(), await router.getAddress())).wait();
    return { coordinator, owner, router, creator, operator, evaluator, other };
  }

  async function deployHook() {
    const HookFactory = await ethers.getContractFactory("MockTaskPolicyHook");
    const hook = await HookFactory.deploy();
    await hook.waitForDeployment();
    return hook;
  }

  async function makePolicy(
    maxClaims = 1,
    maxClaimsPerOperator = 1,
    requiredVerdicts = 1,
  ) {
    const now = await time.latest();
    return {
      claimWindowStart: now,
      claimWindowEnd: now + 600,
      submissionDeadline: now + 1800,
      claimLeaseTtlSeconds: 300,
      maxClaims,
      maxClaimsPerOperator,
      policyHook: ethers.ZeroAddress,
      evaluationPolicy: {
        requiredVerdicts,
        passThreshold: 1,
        evaluationDuration: 600,
        externalReadyAt: 0,
        maxVerdictsPerEvaluator: 1,
        disallowSolverSelfEvaluation: true,
      },
    };
  }

  async function createSubmittedAttempt(coordinator: any, router: any, creator: string, operator: string) {
    await coordinator.connect(router).createTask(creator, TASK_CID, SOLVER_TYPE, await makePolicy());
    await coordinator.connect(router).claimTask(1, operator);
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, operator, SOLUTION_CID, ethers.parseEther("1"));
  }

  it("creates a Task and defaults zero evaluation policy values", async function () {
    const { coordinator, router, creator } = await deploy();
    const now = await time.latest();
    const policy = {
      claimWindowStart: now,
      claimWindowEnd: now + 600,
      submissionDeadline: now + 1800,
      claimLeaseTtlSeconds: 300,
      maxClaims: 25,
      maxClaimsPerOperator: 1,
      policyHook: ethers.ZeroAddress,
      evaluationPolicy: {
        requiredVerdicts: 0,
        passThreshold: 0,
        evaluationDuration: 0,
        externalReadyAt: 0,
        maxVerdictsPerEvaluator: 0,
        disallowSolverSelfEvaluation: false,
      },
    };

    const expectedDuration = policy.submissionDeadline - policy.claimWindowStart;
    await expect(
      coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy)
    ).to.emit(coordinator, "TaskCreated").withArgs(
      1,
      await creator.getAddress(),
      SOLVER_TYPE,
      TASK_CID,
      25,
      1,
      policy.claimWindowStart,
      policy.claimWindowEnd,
      policy.submissionDeadline,
      expectedDuration,
      0
    );

    const record = await coordinator.getTask(1);
    expect(record.creator).to.equal(await creator.getAddress());
    expect(record.policy.evaluationPolicy.requiredVerdicts).to.equal(1);
    expect(record.policy.evaluationPolicy.passThreshold).to.equal(1);
    expect(record.policy.evaluationPolicy.maxVerdictsPerEvaluator).to.equal(1);
    expect(record.policy.evaluationPolicy.disallowSolverSelfEvaluation).to.equal(true);
    expect(record.policy.evaluationPolicy.evaluationDuration).to.equal(expectedDuration);
    expect(record.policy.evaluationPolicy.externalReadyAt).to.equal(0);
  });

  it("rejects a policy with explicit zero evaluationDuration", async function () {
    const { coordinator, router, creator } = await deploy();
    const policy = await makePolicy();
    // _normalizePolicy only fills in duration when *all* eval fields are
    // zero (the heuristic). An explicit caller that sets requiredVerdicts
    // but zero duration is treated as a malformed policy.
    policy.evaluationPolicy.evaluationDuration = 0;
    await expect(
      coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy)
    ).to.be.revertedWithCustomError(coordinator, "TCInvalidPolicy");
  });

  it("claims an exclusive Task once", async function () {
    const { coordinator, router, creator, operator, other } = await deploy();
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, await makePolicy(1, 1));

    await expect(coordinator.connect(router).claimTask(1, await operator.getAddress()))
      .to.emit(coordinator, "TaskClaimed")
      .withArgs(1, 0, await operator.getAddress(), anyValue);

    const attempt = await coordinator.getAttempt(1, 0);
    expect(attempt.operator).to.equal(await operator.getAddress());

    await expect(
      coordinator.connect(router).claimTask(1, await other.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCMaxClaimsReached");
  });

  it("claims a parallel Task up to maxClaims and rejects duplicate operator claims", async function () {
    const { coordinator, router, creator, operator, other } = await deploy();
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, await makePolicy(2, 1));

    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await expect(
      coordinator.connect(router).claimTask(1, await operator.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCOperatorClaimLimitReached");

    await coordinator.connect(router).claimTask(1, await other.getAddress());
    const record = await coordinator.getTask(1);
    expect(record.claimCount).to.equal(2);
  });

  it("registers a Solution request and records a submitted attempt", async function () {
    const { coordinator, router, creator, operator } = await deploy();
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, await makePolicy());
    await coordinator.connect(router).claimTask(1, await operator.getAddress());

    await expect(coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID))
      .to.emit(coordinator, "TaskAttemptRequestRegistered")
      .withArgs(1, 0, REQUEST_ID);

    await expect(coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7))
      .to.emit(coordinator, "TaskSubmitted")
      .withArgs(1, 0, await operator.getAddress(), REQUEST_ID, SOLUTION_CID, 7);

    const attempt = await coordinator.getAttempt(1, 0);
    expect(attempt.solutionCidDigest).to.equal(SOLUTION_CID);
    expect(attempt.solutionWeight).to.equal(7);
    expect(attempt.status).to.equal(3);
    expect(attempt.finalization).to.equal(1);
  });

  it("rejects solution submissions after the claim lease expires", async function () {
    const { coordinator, router, creator, operator } = await deploy();
    const policy = await makePolicy();
    policy.claimLeaseTtlSeconds = 30;
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await time.increase(31);

    await expect(
      coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7)
    ).to.be.revertedWithCustomError(coordinator, "TCAttemptClaimExpired");
  });

  it("claims and records a Verdict, finalizing the attempt and locking creator credit once", async function () {
    const { coordinator, router, creator, operator, evaluator, other } = await deploy();
    await createSubmittedAttempt(coordinator, router, await creator.getAddress(), await operator.getAddress());

    await expect(coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress()))
      .to.emit(coordinator, "EvaluationClaimed")
      .withArgs(1, 0, 0, await evaluator.getAddress(), anyValue);

    await coordinator.connect(router).registerVerdictRequest(1, 0, 0, VERDICT_REQUEST_ID);

    const tx = await coordinator.connect(router).recordVerdict(
      VERDICT_REQUEST_ID,
      await evaluator.getAddress(),
      VERDICT_CID,
      VERDICT_PASS
    );
    await expect(tx).to.emit(coordinator, "AttemptFinalized").withArgs(1, 0, true, 1, 1);
    await expect(tx).to.emit(coordinator, "TaskCreationCreditLocked").withArgs(
      1,
      await creator.getAddress(),
      ethers.parseEther("1")
    );

    const task = await coordinator.getTask(1);
    const attempt = await coordinator.getAttempt(1, 0);
    expect(task.taskCreationCredited).to.equal(true);
    expect(task.finalizedAttemptCount).to.equal(1);
    expect(attempt.finalization).to.equal(2);

    await expect(
      coordinator.connect(router).claimEvaluation(1, 0, await other.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCAttemptAlreadyFinalized");
  });

  it("rejects solver self-evaluation and duplicate evaluator claims", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    await createSubmittedAttempt(coordinator, router, await creator.getAddress(), await operator.getAddress());

    await expect(
      coordinator.connect(router).claimEvaluation(1, 0, await operator.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCSolverSelfEvaluation");

    await coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress());
    await expect(
      coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCMaxVerdictsReached");
  });

  it("rejects verdict submissions after the evaluator claim lease expires", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    const policy = await makePolicy();
    policy.claimLeaseTtlSeconds = 30;
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);
    await coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress());
    await coordinator.connect(router).registerVerdictRequest(1, 0, 0, VERDICT_REQUEST_ID);
    await time.increase(31);

    await expect(
      coordinator.connect(router).recordVerdict(
        VERDICT_REQUEST_ID,
        await evaluator.getAddress(),
        VERDICT_CID,
        VERDICT_PASS
      )
    ).to.be.revertedWithCustomError(coordinator, "TCVerdictClaimExpired");
  });

  it("rejects claims outside the claim window", async function () {
    const { coordinator, router, creator, operator } = await deploy();
    const now = await time.latest();
    const policy = await makePolicy();
    policy.claimWindowStart = now + 100;
    policy.claimWindowEnd = now + 200;
    policy.submissionDeadline = now + 300;
    policy.evaluationPolicy.evaluationDuration = 600;
    policy.evaluationPolicy.externalReadyAt = 0;

    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);

    await expect(
      coordinator.connect(router).claimTask(1, await operator.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCClaimWindowClosed");
  });

  it("expires no-show attempts without reopening the cap", async function () {
    const { coordinator, router, creator, operator, other } = await deploy();
    const policy = await makePolicy(1, 1);
    policy.claimLeaseTtlSeconds = 30;
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await time.increase(31);

    await expect(coordinator.expireAttempt(1, 0))
      .to.emit(coordinator, "TaskAttemptExpired")
      .withArgs(1, 0, await operator.getAddress());

    await expect(
      coordinator.connect(router).claimTask(1, await other.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCMaxClaimsReached");
  });

  // ── Stage 1 lazy-window + role-keyed policyHook + Unresolved-non-finalizing ──

  it("opens the evaluation window lazily at max(submittedAt, externalReadyAt) and closes after duration", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    const now = await time.latest();
    const policy = await makePolicy();
    policy.submissionDeadline = now + 600;
    policy.claimWindowEnd = now + 600;
    policy.evaluationPolicy.evaluationDuration = 600;
    policy.evaluationPolicy.externalReadyAt = now + 1000;

    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);
    const submittedAt = await time.latest();

    // Before externalReadyAt: window not yet open.
    await time.increaseTo(submittedAt + 100);
    await expect(
      coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCEvaluationNotYetOpen");

    // After externalReadyAt but within duration: succeeds.
    await time.increaseTo(now + 1100);
    await expect(coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress()))
      .to.emit(coordinator, "EvaluationClaimed");

    // closes-at = max(submittedAt, externalReadyAt) + duration = (now+1000) + 600 = now+1600.
    // Reset by deploying a second task with the same shape to test the close case.
    const policy2 = await makePolicy();
    const now2 = await time.latest();
    policy2.submissionDeadline = now2 + 200;
    policy2.claimWindowEnd = now2 + 200;
    policy2.evaluationPolicy.evaluationDuration = 600;
    policy2.evaluationPolicy.externalReadyAt = now2 + 100;
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy2);
    await coordinator.connect(router).claimTask(2, await operator.getAddress());
    const altRequest = ethers.keccak256(ethers.toUtf8Bytes("alt-request"));
    await coordinator.connect(router).registerAttemptRequest(2, 0, altRequest);
    await coordinator.connect(router).recordSubmission(altRequest, await operator.getAddress(), SOLUTION_CID, 7);
    const submitted2 = await time.latest();
    // closes-at = max(submitted2, externalReadyAt=now2+100) + 600.
    const closesAt2 = Math.max(submitted2, now2 + 100) + 600;
    await time.increaseTo(closesAt2 + 1);
    await expect(
      coordinator.connect(router).claimEvaluation(2, 0, await evaluator.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCEvaluationDeadlinePassed");
  });

  it("recordVerdict honors the lazy close-at (claim succeeds, verdict deadline passes mid-lease)", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    const now = await time.latest();
    const policy = await makePolicy();
    policy.submissionDeadline = now + 200;
    policy.claimWindowEnd = now + 200;
    policy.evaluationPolicy.evaluationDuration = 600;
    policy.evaluationPolicy.externalReadyAt = now + 100;
    policy.claimLeaseTtlSeconds = 1200;

    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);
    const submittedAt = await time.latest();
    const closesAt = Math.max(submittedAt, now + 100) + 600;

    await time.increaseTo(now + 150);
    await coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress());
    await coordinator.connect(router).registerVerdictRequest(1, 0, 0, VERDICT_REQUEST_ID);

    await time.increaseTo(closesAt + 1);
    await expect(
      coordinator.connect(router).recordVerdict(
        VERDICT_REQUEST_ID,
        await evaluator.getAddress(),
        VERDICT_CID,
        VERDICT_PASS
      )
    ).to.be.revertedWithCustomError(coordinator, "TCEvaluationDeadlinePassed");
  });

  it("caps claimExpiresAt at evaluationClosesAt regardless of claimLeaseTtl", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    const now = await time.latest();
    const policy = await makePolicy();
    policy.submissionDeadline = now + 200;
    policy.claimWindowEnd = now + 200;
    policy.evaluationPolicy.evaluationDuration = 60;
    policy.evaluationPolicy.externalReadyAt = 0;
    policy.claimLeaseTtlSeconds = 10000;

    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);
    const submittedAt = await time.latest();
    const closesAt = submittedAt + 60;

    await coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress());
    const verdict = await coordinator.getVerdict(1, 0, 0);
    expect(verdict.claimExpiresAt).to.equal(closesAt);
  });

  it("Unresolved verdict re-opens the slot — does not finalize, validVerdictCount stays 0", async function () {
    const { coordinator, router, creator, operator, evaluator, other } = await deploy();
    await createSubmittedAttempt(coordinator, router, await creator.getAddress(), await operator.getAddress());

    await coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress());
    await coordinator.connect(router).registerVerdictRequest(1, 0, 0, VERDICT_REQUEST_ID);

    const tx = await coordinator.connect(router).recordVerdict(
      VERDICT_REQUEST_ID,
      await evaluator.getAddress(),
      VERDICT_CID,
      VERDICT_UNRESOLVED
    );
    // VerdictDelivered emitted; AttemptFinalized must NOT be.
    await expect(tx).to.emit(coordinator, "VerdictDelivered");
    await expect(tx).to.not.emit(coordinator, "AttemptFinalized");

    const attempt = await coordinator.getAttempt(1, 0);
    expect(attempt.validVerdictCount).to.equal(0);
    expect(attempt.passVerdictCount).to.equal(0);
    // verdictClaimCount stays monotonic (slot pointer); unresolvedVerdictCount
    // tracks how many slots returned to the pool. Active claims =
    // verdictClaimCount - unresolvedVerdictCount = 0 → re-claimable.
    expect(attempt.verdictClaimCount).to.equal(1);
    expect(attempt.unresolvedVerdictCount).to.equal(1);
    expect(attempt.finalization).to.equal(1); // still PendingEvaluation

    // The slot is re-claimable by another evaluator; new verdictIndex = 1.
    await expect(coordinator.connect(router).claimEvaluation(1, 0, await other.getAddress()))
      .to.emit(coordinator, "EvaluationClaimed")
      .withArgs(1, 0, 1, await other.getAddress(), anyValue);
  });

  it("mixed Pass + Unresolved with requiredVerdicts=2 stays pending until two non-Unresolved verdicts arrive", async function () {
    const { coordinator, router, creator, operator, evaluator, other } = await deploy();
    const [, , , , , , extra] = await ethers.getSigners();
    await coordinator.connect(router).createTask(
      await creator.getAddress(),
      TASK_CID,
      SOLVER_TYPE,
      {
        ...(await makePolicy()),
        evaluationPolicy: {
          requiredVerdicts: 2,
          passThreshold: 2,
          evaluationDuration: 600,
          externalReadyAt: 0,
          maxVerdictsPerEvaluator: 1,
          disallowSolverSelfEvaluation: true,
        },
      }
    );
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, ethers.parseEther("1"));

    // Evaluator 1: Unresolved — re-opens the slot.
    await coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress());
    await coordinator.connect(router).registerVerdictRequest(1, 0, 0, VERDICT_REQUEST_ID);
    const tx1 = await coordinator.connect(router).recordVerdict(
      VERDICT_REQUEST_ID,
      await evaluator.getAddress(),
      VERDICT_CID,
      VERDICT_UNRESOLVED
    );
    await expect(tx1).to.not.emit(coordinator, "AttemptFinalized");

    // Evaluator 2: Pass.
    await coordinator.connect(router).claimEvaluation(1, 0, await other.getAddress());
    await coordinator.connect(router).registerVerdictRequest(1, 0, 1, VERDICT_REQUEST_ID_2);
    const tx2 = await coordinator.connect(router).recordVerdict(
      VERDICT_REQUEST_ID_2,
      await other.getAddress(),
      VERDICT_CID_2,
      VERDICT_PASS
    );
    await expect(tx2).to.not.emit(coordinator, "AttemptFinalized"); // only 1 valid, need 2

    // Evaluator 3: Pass — finalizes.
    const v3req = ethers.keccak256(ethers.toUtf8Bytes("v3-req"));
    const v3cid = ethers.keccak256(ethers.toUtf8Bytes("v3-cid"));
    await coordinator.connect(router).claimEvaluation(1, 0, await extra.getAddress());
    await coordinator.connect(router).registerVerdictRequest(1, 0, 2, v3req);
    const tx3 = await coordinator.connect(router).recordVerdict(
      v3req,
      await extra.getAddress(),
      v3cid,
      VERDICT_PASS
    );
    await expect(tx3).to.emit(coordinator, "AttemptFinalized").withArgs(1, 0, true, 2, 2);
  });

  it("policyHook.canClaim is called on both claimTask (role=0) and claimEvaluation (role=1)", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    const hook = await deployHook();
    const policy = await makePolicy();
    policy.policyHook = await hook.getAddress();

    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);
    await coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress());

    expect(await hook.callsCount()).to.equal(2);
    const call0 = await hook.callAt(0);
    expect(call0[0]).to.equal(await operator.getAddress());
    expect(call0[1]).to.equal(1n);
    expect(call0[3]).to.equal(0); // role=Solver
    const call1 = await hook.callAt(1);
    expect(call1[0]).to.equal(await evaluator.getAddress());
    expect(call1[1]).to.equal(1n);
    expect(call1[3]).to.equal(1); // role=Evaluator
  });

  it("zero policyHook short-circuits both paths", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    const policy = await makePolicy();
    expect(policy.policyHook).to.equal(ethers.ZeroAddress);
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await expect(coordinator.connect(router).claimTask(1, await operator.getAddress()))
      .to.emit(coordinator, "TaskClaimed");
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);
    await expect(coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress()))
      .to.emit(coordinator, "EvaluationClaimed");
  });

  it("rejects evaluator claim when policyHook returns false", async function () {
    const { coordinator, router, creator, operator, evaluator } = await deploy();
    const hook = await deployHook();
    const policy = await makePolicy();
    policy.policyHook = await hook.getAddress();

    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);

    await hook.setAllow(false);
    await expect(
      coordinator.connect(router).claimEvaluation(1, 0, await evaluator.getAddress())
    ).to.be.revertedWithCustomError(coordinator, "TCPolicyHookRejected");
  });

  it("evaluationOpensAt + evaluationClosesAt views match the lazy formula", async function () {
    const { coordinator, router, creator, operator } = await deploy();
    const now = await time.latest();
    const policy = await makePolicy();
    policy.submissionDeadline = now + 200;
    policy.claimWindowEnd = now + 200;
    policy.evaluationPolicy.evaluationDuration = 1000;
    policy.evaluationPolicy.externalReadyAt = now + 500;

    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);
    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 7);
    const submittedAt = await time.latest();

    const opensAt = await coordinator.evaluationOpensAt(1, 0);
    const closesAt = await coordinator.evaluationClosesAt(1, 0);
    const expectedOpens = Math.max(submittedAt, now + 500);
    expect(opensAt).to.equal(expectedOpens);
    expect(closesAt).to.equal(expectedOpens + 1000);
  });

  it("allEvaluationWindowsClosed returns false until every submitted attempt's window has closed", async function () {
    const { coordinator, router, creator, operator, other } = await deploy();
    const policy = await makePolicy(2, 1, 1);
    policy.evaluationPolicy.evaluationDuration = 100;
    policy.evaluationPolicy.externalReadyAt = 0;
    // Operators submit at different timestamps — closes-at differs per attempt.
    await coordinator.connect(router).createTask(await creator.getAddress(), TASK_CID, SOLVER_TYPE, policy);

    await coordinator.connect(router).claimTask(1, await operator.getAddress());
    await coordinator.connect(router).registerAttemptRequest(1, 0, REQUEST_ID);
    await coordinator.connect(router).recordSubmission(REQUEST_ID, await operator.getAddress(), SOLUTION_CID, 1);
    const submittedA = await time.latest();
    const closesA = submittedA + 100;

    await time.increase(50);
    await coordinator.connect(router).claimTask(1, await other.getAddress());
    const reqB = ethers.keccak256(ethers.toUtf8Bytes("req-b"));
    await coordinator.connect(router).registerAttemptRequest(1, 1, reqB);
    await coordinator.connect(router).recordSubmission(reqB, await other.getAddress(), SOLUTION_CID, 1);
    const submittedB = await time.latest();
    const closesB = submittedB + 100;
    expect(closesB).to.be.greaterThan(closesA);

    // After A's window closes but before B's:
    await time.increaseTo(closesA + 1);
    expect(await coordinator.allEvaluationWindowsClosed(1)).to.equal(false);

    // After B's closes:
    await time.increaseTo(closesB + 1);
    expect(await coordinator.allEvaluationWindowsClosed(1)).to.equal(true);
  });
});
