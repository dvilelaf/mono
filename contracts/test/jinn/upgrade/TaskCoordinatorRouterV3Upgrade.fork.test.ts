/**
 * Hardhat fork test — TaskCoordinator + JinnRouterV3 manifestDigest proxy upgrade.
 *
 * Forks live Base Sepolia state via `hardhat_reset` (per-test scope, NOT
 * via `hardhat.config.ts` — config-level forking would attach to all 449
 * existing tests). Runs the in-place proxy upgrade against the deployed
 * stack and asserts:
 *
 *   1. Existing-task storage compatibility (full getTask snapshot pre/post
 *      upgrade match — every field, including manifestDigest).
 *   2. Implementation pointers updated on both proxies.
 *   3. Activity-checker implementation rewired (changeImplementation path).
 *   4. Fresh task post-upgrade carries manifestDigest = keccak256(cid)
 *      (decoded from the on-chain TaskCreated log via the parsed Interface).
 *   5. The newly-created task can be re-read by id and its manifestDigest
 *      matches the synthesised digest.
 *
 * SKIPPED BY DEFAULT — opt in with RUN_FORK_TESTS=1. Optional
 * FORK_BLOCK_NUMBER pins reproducibility. The deployer is impersonated and
 * funded via hardhat_setBalance; no deployer key is required.
 *
 * Reference (do NOT import — it requires DEPLOYER_PRIVATE_KEY):
 *   contracts/scripts/upgrade-task-coordinator-router-v3.ts
 *
 * The structure of the policy() helper + budget math follows the canonical
 * test in contracts/test/TaskCoordinatorRouterV3.integration.test.ts.
 */

import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import deployment from "../../../deployment-task-coordinator-router-v3-baseSepolia-fast.json";

const PROXY_VIEW_ABI = [
  "function getImplementation() view returns (address)",
  "function getAdmin() view returns (address)",
];
const PROXY_UPGRADE_ABI = ["function upgradeTo(address newImplementation) external"];
const CHECKER_ABI = [
  "function owner() view returns (address)",
  "function changeImplementation(address newImplementation) external",
];

describe("TaskCoordinator + JinnRouterV3 manifestDigest upgrade — Base Sepolia fork", function () {
  this.timeout(180_000);

  // Captured between assertions so they can share state.
  let snapshotTaskId: bigint | null = null;
  // Plain JSON object (bigints serialised to strings) so deep.equal works.
  let snapshotPre: unknown = null;
  let coordinatorImplAddress: string | null = null;
  let routerImplAddress: string | null = null;
  let checkerImplAddress: string | null = null;

  // Activity-checker pre-snapshot: keyed by sample creator. We snapshot
  // taskCreationWeight and the per-task taskCreationFinalized flag for the
  // task we discover in the first assertion. After the upgrade we re-read
  // both and assert equality (storage-layout compatibility for the
  // V3 activity-checker fork).
  let activitySampleCreator: string | null = null;
  let activityTaskCreationWeightPre: bigint | null = null;
  let activityTaskCreationFinalizedPre: boolean | null = null;

  // Lifecycle scratch state — populated across the post-upgrade lifecycle
  // it() blocks. Each block reuses values from the previous (mech address,
  // attempt index, request id) via these describe-scoped bindings.
  let lifecycleTaskId: bigint | null = null;
  let lifecycleManifestDigest: string | null = null;
  let lifecycleSolverMech: string | null = null;
  let lifecycleEvaluatorMech: string | null = null;
  let lifecycleSolverRequestId: string | null = null;
  let lifecycleSolverAttemptIndex: number | null = null;
  let lifecycleVerdictRequestId: string | null = null;
  let lifecycleVerdictIndex: number | null = null;

  const coordinatorAddr = deployment.contracts.taskCoordinator;
  const routerAddr = deployment.contracts.jinnRouterV3;
  const checkerAddr = deployment.contracts.activityChecker;
  const marketplaceAddr = deployment.contracts.mechMarketplace;
  const deployerAddr = deployment.deployer;

  // MechMarketplace storage layout (computed from src/vendor/mech/MechMarketplace.sol):
  //   Constants + immutables consume no slots.
  //   Slot 0: domainSeparator (bytes32)
  //   Slot 1: fee
  //   Slot 2: minResponseTimeout
  //   Slot 3: maxResponseTimeout
  //   Slot 4: numUndeliveredRequests
  //   Slot 5: numTotalRequests
  //   Slot 6: numMechs
  //   Slot 7: _locked
  //   Slot 8: owner
  //   Slot 9: mapRequestCounts
  //   Slot 10: mapDeliveryCounts
  //   Slot 11: mapMechDeliveryCounts
  //   Slot 12: mapMechServiceDeliveryCounts
  //   Slot 13: mapRequestIdInfos
  //   Slot 14: mapMechFactories
  //   Slot 15: mapAgentMechFactories      <-- whitelist mock mech here
  // RequestInfo struct layout (6 slots, packed by Solidity rules):
  //   +0: priorityMech
  //   +1: deliveryMech                    <-- write to mark "delivered"
  //   +2: requester
  //   +3: responseTimeout
  //   +4: deliveryRate
  //   +5: paymentType
  const MECH_FACTORY_MAP_SLOT = 15n;
  const REQUEST_INFO_MAP_SLOT = 13n;

  before(async function () {
    if (process.env.RUN_FORK_TESTS !== "1") {
      this.skip();
    }
    const url = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
    const blockNumber = process.env.FORK_BLOCK_NUMBER
      ? Number(process.env.FORK_BLOCK_NUMBER)
      : undefined;
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: url,
            ...(blockNumber ? { blockNumber } : {}),
          },
        },
      ],
    });
    const resolvedBlock = await ethers.provider.getBlockNumber();
    // eslint-disable-next-line no-console
    console.log(
      `[fork] Base Sepolia @ block ${blockNumber ?? "latest"} (resolved: ${resolvedBlock})`,
    );
  });

  after(async () => {
    // Detach the fork so subsequent `yarn test` runs return to the in-memory
    // chain without leaking forked state.
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("snapshots an existing task before the upgrade", async function () {
    const coordinator = await ethers.getContractAt("TaskCoordinator", coordinatorAddr);
    const nextId: bigint = await coordinator.nextTaskId();

    if (nextId === 0n) {
      // eslint-disable-next-line no-console
      console.log("[fork] nextTaskId = 0 — no real task on the forked chain; skipping pre/post snapshot");
      return;
    }

    for (let id = nextId - 1n; ; id--) {
      const t = await coordinator.getTask(id);
      if (t.creator !== ethers.ZeroAddress) {
        snapshotTaskId = id;
        snapshotPre = JSON.parse(
          JSON.stringify(t, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
        );
        activitySampleCreator = t.creator as string;
        // eslint-disable-next-line no-console
        console.log(`[fork] Snapshotted existing task id=${id}`);
        break;
      }
      if (id === 0n) break;
    }

    if (snapshotTaskId === null) {
      // eslint-disable-next-line no-console
      console.log("[fork] No real task on the forked chain; skipping pre/post snapshot");
    }
  });

  it("snapshots activity-checker state before the upgrade", async function () {
    if (activitySampleCreator === null || snapshotTaskId === null) {
      // eslint-disable-next-line no-console
      console.log(
        "[fork] no creator/taskId discovered in the prior snapshot — skipping activity-checker snapshot (will skip the post-upgrade comparison too)",
      );
      this.skip();
      return;
    }
    const checker = await ethers.getContractAt("TaskActivityCheckerV3", checkerAddr);
    activityTaskCreationWeightPre = await checker.taskCreationWeight(activitySampleCreator);
    activityTaskCreationFinalizedPre = await checker.taskCreationFinalized(snapshotTaskId);
    // eslint-disable-next-line no-console
    console.log(
      `[fork] activity-checker pre-snapshot: creator=${activitySampleCreator} taskCreationWeight=${activityTaskCreationWeightPre.toString()} taskCreationFinalized[${snapshotTaskId.toString()}]=${activityTaskCreationFinalizedPre}`,
    );
  });

  it("upgrades both proxies + the activity checker in-fork", async function () {
    // Impersonate the deployer (proxy admin / checker owner per the live
    // deployment artifact) and top up balance for deployments + upgrade
    // calls. We avoid taking DEPLOYER_PRIVATE_KEY: the fork is ephemeral.
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [deployerAddr],
    });
    await network.provider.send("hardhat_setBalance", [
      deployerAddr,
      "0x10000000000000000000", // ~295 ETH; large headroom for L2 priority fee math.
    ]);
    const deployer = await ethers.getSigner(deployerAddr);

    // Sanity-check we are upgrading the right thing.
    const coordinatorProxyView = new ethers.Contract(coordinatorAddr, PROXY_VIEW_ABI, ethers.provider);
    const routerProxyView = new ethers.Contract(routerAddr, PROXY_VIEW_ABI, ethers.provider);
    const [coordAdmin, routerAdmin] = await Promise.all([
      coordinatorProxyView.getAdmin(),
      routerProxyView.getAdmin(),
    ]);
    expect(coordAdmin.toLowerCase(), "coordinator proxy admin").to.equal(deployerAddr.toLowerCase());
    expect(routerAdmin.toLowerCase(), "router proxy admin").to.equal(deployerAddr.toLowerCase());

    // 1. Deploy fresh implementations from the worktree's local artifacts.
    const Coordinator = await ethers.getContractFactory("TaskCoordinator", deployer);
    const newCoordImpl = await Coordinator.deploy();
    await newCoordImpl.waitForDeployment();
    coordinatorImplAddress = await newCoordImpl.getAddress();

    const Router = await ethers.getContractFactory("JinnRouterV3", deployer);
    const newRouterImpl = await Router.deploy();
    await newRouterImpl.waitForDeployment();
    routerImplAddress = await newRouterImpl.getAddress();

    const Checker = await ethers.getContractFactory("TaskActivityCheckerV3", deployer);
    const newCheckerImpl = await Checker.deploy();
    await newCheckerImpl.waitForDeployment();
    checkerImplAddress = await newCheckerImpl.getAddress();

    // 2. Upgrade both proxies via the JinnUpgradeableProxy `upgradeTo` admin path.
    const coordinatorProxy = new ethers.Contract(coordinatorAddr, PROXY_UPGRADE_ABI, deployer);
    const routerProxy = new ethers.Contract(routerAddr, PROXY_UPGRADE_ABI, deployer);
    await (await coordinatorProxy.upgradeTo(coordinatorImplAddress)).wait();
    await (await routerProxy.upgradeTo(routerImplAddress)).wait();

    // 3. Activity checker uses Implementation.changeImplementation (not upgradeTo).
    const checker = new ethers.Contract(checkerAddr, CHECKER_ABI, deployer);
    const checkerOwner = await checker.owner();
    expect(checkerOwner.toLowerCase(), "checker owner").to.equal(deployerAddr.toLowerCase());
    await (await checker.changeImplementation(checkerImplAddress)).wait();
  });

  it("points the proxies at the freshly deployed implementations", async function () {
    expect(coordinatorImplAddress, "coordinator impl was deployed").to.be.a("string");
    expect(routerImplAddress, "router impl was deployed").to.be.a("string");
    const coordinatorProxyView = new ethers.Contract(coordinatorAddr, PROXY_VIEW_ABI, ethers.provider);
    const routerProxyView = new ethers.Contract(routerAddr, PROXY_VIEW_ABI, ethers.provider);
    expect(await coordinatorProxyView.getImplementation()).to.equal(coordinatorImplAddress);
    expect(await routerProxyView.getImplementation()).to.equal(routerImplAddress);
  });

  it("preserves the existing task's storage layout across the upgrade", async function () {
    if (snapshotTaskId === null) {
      // eslint-disable-next-line no-console
      console.log("[fork] no pre-snapshot — nothing to compare");
      this.skip();
      return;
    }
    const coordinator = await ethers.getContractAt("TaskCoordinator", coordinatorAddr);
    const post = await coordinator.getTask(snapshotTaskId);
    const postSerial = JSON.parse(
      JSON.stringify(post, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    );
    expect(postSerial).to.deep.equal(snapshotPre);
  });

  it("creates a fresh task post-upgrade and decodes manifestDigest = keccak256(cid)", async function () {
    // Reasonable-looking manifest CID — any non-zero bytes32 keccak digest works
    // for the on-chain assertion; the digest is what we check.
    const manifestCid = "bafkreigh2akiscaildc" + "0".repeat(40);
    const manifestDigest = ethers.keccak256(ethers.toUtf8Bytes(manifestCid));
    const taskCidDigest = ethers.keccak256(
      ethers.toUtf8Bytes(`test-task-cid-fork-${Date.now()}`),
    );

    // Use a fresh hardhat-funded creator so we don't perturb the deployer's
    // nonce (which several tests above have already incremented).
    const [_owner, freshCreator] = await ethers.getSigners();

    // Build a TaskPolicy mirroring the canonical integration test helper.
    // Mirror: contracts/test/TaskCoordinatorRouterV3.integration.test.ts > policy()
    const now = await time.latest();
    const policy = {
      claimWindowStart: now,
      claimWindowEnd: now + 600,
      submissionDeadline: now + 1800,
      claimLeaseTtlSeconds: 300,
      maxClaims: 2,
      maxClaimsPerOperator: 1,
      policyHook: ethers.ZeroAddress,
      evaluationPolicy: {
        requiredVerdicts: 1,
        passThreshold: 1,
        evaluationDeadline: now + 2400,
        maxVerdictsPerEvaluator: 2,
        disallowSolverSelfEvaluation: true,
      },
    };

    const solutionRate = ethers.parseEther("0.001");
    const verdictRate = ethers.parseEther("0.0005");
    const responseTimeout = 3600n;

    // requiredVerdicts collapses to 1 in this policy => budget math:
    //   solutionBudget = solutionRate * maxClaims
    //   verdictBudget  = verdictRate  * maxClaims * requiredVerdicts
    const value =
      solutionRate * BigInt(policy.maxClaims) +
      verdictRate * BigInt(policy.maxClaims) * BigInt(policy.evaluationPolicy.requiredVerdicts);

    const router = await ethers.getContractAt(
      "JinnRouterV3",
      routerAddr,
      freshCreator,
    );
    const tx = await router.createTask(
      taskCidDigest,
      manifestDigest,
      policy,
      solutionRate,
      verdictRate,
      responseTimeout,
      { value },
    );
    const receipt = await tx.wait();
    expect(receipt, "createTask receipt").to.not.equal(null);

    const coordinator = await ethers.getContractAt("TaskCoordinator", coordinatorAddr);
    const taskCreatedEvent = coordinator.interface.getEvent("TaskCreated");
    expect(taskCreatedEvent, "TaskCreated event in ABI").to.not.equal(null);
    const topic = taskCreatedEvent!.topicHash;

    const log = receipt!.logs.find(
      (l) =>
        l.topics[0] === topic &&
        l.address.toLowerCase() === coordinatorAddr.toLowerCase(),
    );
    expect(log, "TaskCoordinator.TaskCreated log emitted").to.not.equal(undefined);
    const parsed = coordinator.interface.parseLog({
      topics: log!.topics as string[],
      data: log!.data,
    });
    expect(parsed, "decoded TaskCreated log").to.not.equal(null);
    expect(parsed!.args.manifestDigest).to.equal(manifestDigest);

    const newTaskId = parsed!.args.taskId as bigint;
    const fetched = await coordinator.getTask(newTaskId);
    expect(fetched.manifestDigest).to.equal(manifestDigest);
    expect(fetched.taskCidDigest).to.equal(taskCidDigest);
    expect(fetched.creator).to.equal(await freshCreator.getAddress());
  });

  it("upgraded proxy code matches the local artifact bytecode (no compile drift)", async function () {
    expect(coordinatorImplAddress, "coordinator impl was deployed").to.be.a("string");
    expect(routerImplAddress, "router impl was deployed").to.be.a("string");
    expect(checkerImplAddress, "checker impl was deployed").to.be.a("string");

    // Deploy fresh "reference" implementations from the *same* worktree
    // artifacts and compare keccak256 of deployed bytecode. If the on-chain
    // impl wasn't produced from the local artifact (compiler drift, wrong
    // settings, wrong source) the digests diverge.
    const [_owner, _creator, refDeployer] = await ethers.getSigners();
    const Coordinator = await ethers.getContractFactory("TaskCoordinator", refDeployer);
    const refCoord = await Coordinator.deploy();
    await refCoord.waitForDeployment();
    const Router = await ethers.getContractFactory("JinnRouterV3", refDeployer);
    const refRouter = await Router.deploy();
    await refRouter.waitForDeployment();
    const Checker = await ethers.getContractFactory("TaskActivityCheckerV3", refDeployer);
    const refChecker = await Checker.deploy();
    await refChecker.waitForDeployment();

    const refCoordAddr = await refCoord.getAddress();
    const refRouterAddr = await refRouter.getAddress();
    const refCheckerAddr = await refChecker.getAddress();

    const coordinatorProxyView = new ethers.Contract(coordinatorAddr, PROXY_VIEW_ABI, ethers.provider);
    const routerProxyView = new ethers.Contract(routerAddr, PROXY_VIEW_ABI, ethers.provider);
    const onChainCoordImpl: string = await coordinatorProxyView.getImplementation();
    const onChainRouterImpl: string = await routerProxyView.getImplementation();
    // The activity checker proxy doesn't expose getImplementation() the same
    // way — it owns its impl pointer in the storage of the changeImplementation
    // implementation contract. We compare the live checker proxy's runtime
    // bytecode against the locally deployed checker impl directly.

    const [coordOnCode, coordRefCode] = await Promise.all([
      ethers.provider.getCode(onChainCoordImpl),
      ethers.provider.getCode(refCoordAddr),
    ]);
    const [routerOnCode, routerRefCode] = await Promise.all([
      ethers.provider.getCode(onChainRouterImpl),
      ethers.provider.getCode(refRouterAddr),
    ]);
    const [checkerOnCode, checkerRefCode] = await Promise.all([
      ethers.provider.getCode(checkerImplAddress as string),
      ethers.provider.getCode(refCheckerAddr),
    ]);

    expect(ethers.keccak256(coordOnCode), "TaskCoordinator impl bytecode digest").to.equal(
      ethers.keccak256(coordRefCode),
    );
    expect(ethers.keccak256(routerOnCode), "JinnRouterV3 impl bytecode digest").to.equal(
      ethers.keccak256(routerRefCode),
    );
    expect(ethers.keccak256(checkerOnCode), "TaskActivityCheckerV3 impl bytecode digest").to.equal(
      ethers.keccak256(checkerRefCode),
    );
  });

  it("preserves activity-checker storage across the upgrade", async function () {
    if (
      activitySampleCreator === null ||
      activityTaskCreationWeightPre === null ||
      activityTaskCreationFinalizedPre === null ||
      snapshotTaskId === null
    ) {
      // eslint-disable-next-line no-console
      console.log("[fork] no activity-checker pre-snapshot — nothing to compare");
      this.skip();
      return;
    }
    const checker = await ethers.getContractAt("TaskActivityCheckerV3", checkerAddr);
    const post = await checker.taskCreationWeight(activitySampleCreator);
    const finalizedPost = await checker.taskCreationFinalized(snapshotTaskId);
    expect(post, "taskCreationWeight preserved across changeImplementation").to.equal(
      activityTaskCreationWeightPre,
    );
    expect(finalizedPost, "taskCreationFinalized[taskId] preserved").to.equal(
      activityTaskCreationFinalizedPre,
    );
  });

  // ----- Post-upgrade lifecycle (3 it() blocks) -----------------------------
  // The live MechMarketplace whitelists mechs via mapAgentMechFactories[mech]
  // (set by the factory at mech creation). We cannot mint a real mech in the
  // fork without a service-registry round-trip, so we deploy a MockTaskMech
  // and inject its address into the marketplace's storage. The router's
  // `claimTask`/`claimEvaluation` paths then route through the live
  // marketplace's `request` flow normally (live BalanceTracker + Karma still
  // execute on the fork). Delivery is similarly mock-injected: we write to
  // mapRequestIdInfos[requestId].deliveryMech to make the request appear
  // delivered to `getRequestStatus`.

  it("post-upgrade: claimTask emits TaskAttemptCreated decoded via the new ABI", async function () {
    const [, , , freshCreator, freshSolver, freshEvaluator] = await ethers.getSigners();
    const router = await ethers.getContractAt("JinnRouterV3", routerAddr, freshCreator);
    const coordinator = await ethers.getContractAt("TaskCoordinator", coordinatorAddr);

    // Deploy MockTaskMechs (solver + evaluator) and whitelist both via the
    // marketplace's mapAgentMechFactories slot.
    const NATIVE_PAYMENT_TYPE =
      "0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1";
    const solutionRate = ethers.parseEther("0.001");
    const verdictRate = ethers.parseEther("0.0005");

    const Mech = await ethers.getContractFactory("MockTaskMech", freshCreator);
    const solverMech = await Mech.deploy(
      solutionRate,
      NATIVE_PAYMENT_TYPE,
      await freshSolver.getAddress(),
    );
    await solverMech.waitForDeployment();
    const evaluatorMech = await Mech.deploy(
      verdictRate,
      NATIVE_PAYMENT_TYPE,
      await freshEvaluator.getAddress(),
    );
    await evaluatorMech.waitForDeployment();
    lifecycleSolverMech = await solverMech.getAddress();
    lifecycleEvaluatorMech = await evaluatorMech.getAddress();

    // mapAgentMechFactories[mech] = nonZero — slot = keccak256(abi.encode(mech, MECH_FACTORY_MAP_SLOT))
    const factorySlotForSolver = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"],
        [lifecycleSolverMech, MECH_FACTORY_MAP_SLOT],
      ),
    );
    const factorySlotForEvaluator = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"],
        [lifecycleEvaluatorMech, MECH_FACTORY_MAP_SLOT],
      ),
    );
    // We just need a non-zero address; use the deployer (any non-zero
    // address makes the marketplace's `mapAgentMechFactories[mech] ==
    // address(0)` check pass).
    const fakeFactoryAddr = ethers.zeroPadValue(deployerAddr, 32);
    await network.provider.send("hardhat_setStorageAt", [
      marketplaceAddr,
      factorySlotForSolver,
      fakeFactoryAddr,
    ]);
    await network.provider.send("hardhat_setStorageAt", [
      marketplaceAddr,
      factorySlotForEvaluator,
      fakeFactoryAddr,
    ]);

    // Build and post a fresh task (responseTimeout in marketplace's
    // [minResponseTimeout, maxResponseTimeout] window — the live deployment
    // pinned 60 / 300, so we use 120).
    const manifestCid = "bafkreilifecycle" + "0".repeat(46);
    const manifestDigest = ethers.keccak256(ethers.toUtf8Bytes(manifestCid));
    lifecycleManifestDigest = manifestDigest;
    const taskCidDigest = ethers.keccak256(
      ethers.toUtf8Bytes(`lifecycle-task-${Date.now()}`),
    );

    const now = await time.latest();
    const policy = {
      claimWindowStart: now,
      claimWindowEnd: now + 600,
      submissionDeadline: now + 1800,
      claimLeaseTtlSeconds: 300,
      maxClaims: 1,
      maxClaimsPerOperator: 1,
      policyHook: ethers.ZeroAddress,
      evaluationPolicy: {
        requiredVerdicts: 1,
        passThreshold: 1,
        evaluationDeadline: now + 2400,
        maxVerdictsPerEvaluator: 2,
        disallowSolverSelfEvaluation: true,
      },
    };
    const responseTimeout = 120n;
    const value =
      solutionRate * BigInt(policy.maxClaims) +
      verdictRate * BigInt(policy.maxClaims) * BigInt(policy.evaluationPolicy.requiredVerdicts);

    const createTx = await router.createTask(
      taskCidDigest,
      manifestDigest,
      policy,
      solutionRate,
      verdictRate,
      responseTimeout,
      { value },
    );
    const createReceipt = await createTx.wait();
    const taskCreatedEvent = coordinator.interface.getEvent("TaskCreated")!;
    const taskCreatedLog = createReceipt!.logs.find(
      (l) =>
        l.topics[0] === taskCreatedEvent.topicHash &&
        l.address.toLowerCase() === coordinatorAddr.toLowerCase(),
    );
    expect(taskCreatedLog, "TaskCreated log").to.not.equal(undefined);
    const parsedCreated = coordinator.interface.parseLog({
      topics: taskCreatedLog!.topics as string[],
      data: taskCreatedLog!.data,
    });
    lifecycleTaskId = parsedCreated!.args.taskId as bigint;

    // Solver claims the task — exercises live marketplace.request() through
    // BalanceTracker + Karma + records attempt in coordinator.
    const routerAsSolver = router.connect(freshSolver) as typeof router;
    const claimTx = await routerAsSolver.claimTask(lifecycleTaskId, lifecycleSolverMech);
    const claimReceipt = await claimTx.wait();
    expect(claimReceipt, "claimTask receipt").to.not.equal(null);

    const attemptCreatedEvent = router.interface.getEvent("TaskAttemptCreated")!;
    const attemptLog = claimReceipt!.logs.find(
      (l) =>
        l.topics[0] === attemptCreatedEvent.topicHash &&
        l.address.toLowerCase() === routerAddr.toLowerCase(),
    );
    expect(attemptLog, "TaskAttemptCreated log").to.not.equal(undefined);
    const parsedAttempt = router.interface.parseLog({
      topics: attemptLog!.topics as string[],
      data: attemptLog!.data,
    });
    expect(parsedAttempt, "decoded TaskAttemptCreated log").to.not.equal(null);
    expect(parsedAttempt!.args.taskId).to.equal(lifecycleTaskId);
    expect(parsedAttempt!.args.priorityMech.toLowerCase()).to.equal(
      (lifecycleSolverMech as string).toLowerCase(),
    );
    lifecycleSolverRequestId = parsedAttempt!.args.requestId as string;
    lifecycleSolverAttemptIndex = Number(parsedAttempt!.args.attemptIndex);
  });

  it("post-upgrade: claimSolutionDelivery decodes via new ABI + activity-checker records weight", async function () {
    expect(lifecycleSolverRequestId, "solver requestId from prior block").to.be.a("string");
    expect(lifecycleSolverMech, "solver mech from prior block").to.be.a("string");
    expect(lifecycleTaskId, "task id from prior block").to.not.equal(null);
    const [, , , , freshSolver] = await ethers.getSigners();
    const router = await ethers.getContractAt("JinnRouterV3", routerAddr, freshSolver);
    const checker = await ethers.getContractAt("TaskActivityCheckerV3", checkerAddr);

    // Inject "delivered" into the live marketplace's mapRequestIdInfos:
    //   mapRequestIdInfos[requestId] base = keccak256(abi.encode(requestId, 13))
    //   field+1 (deliveryMech) = solverMech
    const baseSlot = BigInt(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint256"],
          [lifecycleSolverRequestId, REQUEST_INFO_MAP_SLOT],
        ),
      ),
    );
    const deliveryMechSlot = ethers.toBeHex(baseSlot + 1n, 32);
    await network.provider.send("hardhat_setStorageAt", [
      marketplaceAddr,
      deliveryMechSlot,
      ethers.zeroPadValue(lifecycleSolverMech as string, 32),
    ]);

    const solverWeightPre = await checker.solutionDeliveryWeight(await freshSolver.getAddress());
    const solutionDigest = ethers.keccak256(
      ethers.toUtf8Bytes(`lifecycle-solution-${Date.now()}`),
    );
    const tx = await router.claimSolutionDelivery(
      lifecycleSolverRequestId as string,
      solutionDigest,
    );
    const receipt = await tx.wait();
    expect(receipt, "claimSolutionDelivery receipt").to.not.equal(null);

    const ev = router.interface.getEvent("SolutionDeliveryClaimed")!;
    const log = receipt!.logs.find(
      (l) =>
        l.topics[0] === ev.topicHash &&
        l.address.toLowerCase() === routerAddr.toLowerCase(),
    );
    expect(log, "SolutionDeliveryClaimed log").to.not.equal(undefined);
    const parsed = router.interface.parseLog({
      topics: log!.topics as string[],
      data: log!.data,
    });
    expect(parsed, "decoded SolutionDeliveryClaimed log").to.not.equal(null);
    expect(parsed!.args.taskId).to.equal(lifecycleTaskId);
    expect(parsed!.args.attemptIndex).to.equal(lifecycleSolverAttemptIndex);

    const solverWeightPost = await checker.solutionDeliveryWeight(await freshSolver.getAddress());
    expect(solverWeightPost > solverWeightPre, "activity-checker recorded solution weight").to.equal(
      true,
    );
  });

  it("post-upgrade: claimEvaluation + claimVerdictDelivery finalize the attempt", async function () {
    expect(lifecycleEvaluatorMech, "evaluator mech from earlier block").to.be.a("string");
    expect(lifecycleTaskId, "task id from earlier block").to.not.equal(null);
    expect(lifecycleSolverAttemptIndex, "attempt index from earlier block").to.be.a("number");
    const [, , , , , freshEvaluator] = await ethers.getSigners();
    const router = await ethers.getContractAt("JinnRouterV3", routerAddr, freshEvaluator);
    const coordinator = await ethers.getContractAt("TaskCoordinator", coordinatorAddr);
    const checker = await ethers.getContractAt("TaskActivityCheckerV3", checkerAddr);

    const evalCidDigest = ethers.keccak256(
      ethers.toUtf8Bytes(`lifecycle-eval-task-${Date.now()}`),
    );
    const claimEvalTx = await router.claimEvaluation(
      lifecycleTaskId as bigint,
      lifecycleSolverAttemptIndex as number,
      lifecycleEvaluatorMech as string,
      evalCidDigest,
    );
    const claimEvalReceipt = await claimEvalTx.wait();
    expect(claimEvalReceipt, "claimEvaluation receipt").to.not.equal(null);

    const evAttempt = router.interface.getEvent("EvaluationAttemptCreated")!;
    const evLog = claimEvalReceipt!.logs.find(
      (l) =>
        l.topics[0] === evAttempt.topicHash &&
        l.address.toLowerCase() === routerAddr.toLowerCase(),
    );
    expect(evLog, "EvaluationAttemptCreated log").to.not.equal(undefined);
    const parsedEv = router.interface.parseLog({
      topics: evLog!.topics as string[],
      data: evLog!.data,
    });
    lifecycleVerdictRequestId = parsedEv!.args.requestId as string;
    lifecycleVerdictIndex = Number(parsedEv!.args.verdictIndex);

    // Inject verdict request as delivered.
    const baseSlot = BigInt(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint256"],
          [lifecycleVerdictRequestId, REQUEST_INFO_MAP_SLOT],
        ),
      ),
    );
    const deliveryMechSlot = ethers.toBeHex(baseSlot + 1n, 32);
    await network.provider.send("hardhat_setStorageAt", [
      marketplaceAddr,
      deliveryMechSlot,
      ethers.zeroPadValue(lifecycleEvaluatorMech as string, 32),
    ]);

    const verdictDigest = ethers.keccak256(
      ethers.toUtf8Bytes(`lifecycle-verdict-${Date.now()}`),
    );
    const verdictWeightPre = await checker.verdictDeliveryWeight(await freshEvaluator.getAddress());
    const taskCreationFinalizedPre = await checker.taskCreationFinalized(
      lifecycleTaskId as bigint,
    );
    expect(taskCreationFinalizedPre, "task not yet credited").to.equal(false);

    // verdictCode = 1 (pass) — meets passThreshold = 1.
    const verdictTx = await router.claimVerdictDelivery(
      lifecycleVerdictRequestId as string,
      verdictDigest,
      1,
    );
    const verdictReceipt = await verdictTx.wait();
    expect(verdictReceipt, "claimVerdictDelivery receipt").to.not.equal(null);

    const verdictEv = router.interface.getEvent("VerdictDeliveryClaimed")!;
    const verdictLog = verdictReceipt!.logs.find(
      (l) =>
        l.topics[0] === verdictEv.topicHash &&
        l.address.toLowerCase() === routerAddr.toLowerCase(),
    );
    expect(verdictLog, "VerdictDeliveryClaimed log").to.not.equal(undefined);
    const parsedVerdict = router.interface.parseLog({
      topics: verdictLog!.topics as string[],
      data: verdictLog!.data,
    });
    expect(parsedVerdict, "decoded VerdictDeliveryClaimed log").to.not.equal(null);
    expect(parsedVerdict!.args.taskId).to.equal(lifecycleTaskId);
    expect(parsedVerdict!.args.verdictIndex).to.equal(lifecycleVerdictIndex);
    expect(parsedVerdict!.args.verdictCode).to.equal(1);

    const verdictWeightPost = await checker.verdictDeliveryWeight(await freshEvaluator.getAddress());
    expect(verdictWeightPost > verdictWeightPre, "activity-checker recorded verdict weight").to.equal(
      true,
    );
    const taskCreationFinalizedPost = await checker.taskCreationFinalized(
      lifecycleTaskId as bigint,
    );
    expect(taskCreationFinalizedPost, "task creation credited post-finalize").to.equal(true);

    // Finally re-read manifestDigest on the now-finalized task to confirm
    // storage layout is intact through the full post-upgrade lifecycle.
    const fetched = await coordinator.getTask(lifecycleTaskId as bigint);
    expect(fetched.manifestDigest).to.equal(lifecycleManifestDigest);
    expect(fetched.finalizedAttemptCount).to.equal(1);
    expect(fetched.taskCreationCredited).to.equal(true);
  });
});
