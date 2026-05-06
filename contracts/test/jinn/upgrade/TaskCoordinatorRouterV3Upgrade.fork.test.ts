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

  const coordinatorAddr = deployment.contracts.taskCoordinator;
  const routerAddr = deployment.contracts.jinnRouterV3;
  const checkerAddr = deployment.contracts.activityChecker;
  const deployerAddr = deployment.deployer;

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
    const checkerImplAddress = await newCheckerImpl.getAddress();

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
});
