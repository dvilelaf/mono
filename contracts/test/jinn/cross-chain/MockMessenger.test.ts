/**
 * Tests for MockMessenger (Phase A4 / bd jinn-mono-6lq).
 *
 * Owner-controlled fixture-injection messenger used in unit tests
 * and Phase D burn-in fallback. Verifies the round-trip, access
 * control, and revert paths.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('MockMessenger', function () {
  this.timeout(30000);

  let messenger: any;
  let owner: any;
  let other: any;
  let multisig: any;

  const SERVICE_ID = 7n;

  beforeEach(async function () {
    [owner, other, multisig] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('MockMessenger');
    messenger = await Factory.deploy(owner.address);
    await messenger.waitForDeployment();
  });

  it('rejects zero owner at deploy', async function () {
    const Factory = await ethers.getContractFactory('MockMessenger');
    await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWith(
      'MockMessenger: owner=0',
    );
  });

  it('verifyClaim returns the fixture for a known serviceId', async function () {
    await messenger.setFixture(SERVICE_ID, {
      verifiedCreations: 10n,
      noveltyWeightedRestorationDeliveries: 20n,
      evaluationDeliveryCount: 5n,
      multisig: multisig.address,
    });

    const proof = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [SERVICE_ID]);
    const result = await messenger.verifyClaim(proof);

    expect(result.serviceId).to.equal(SERVICE_ID);
    expect(result.verifiedCreations).to.equal(10n);
    expect(result.noveltyWeightedRestorationDeliveries).to.equal(20n);
    expect(result.evaluationDeliveryCount).to.equal(5n);
    expect(result.multisig).to.equal(multisig.address);
  });

  it('reverts when no fixture has been set for the serviceId', async function () {
    const proof = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [123n]);
    await expect(messenger.verifyClaim(proof)).to.be.revertedWith(
      'MockMessenger: no fixture',
    );
  });

  it('rejects setFixture from a non-owner', async function () {
    await expect(
      messenger.connect(other).setFixture(SERVICE_ID, {
        verifiedCreations: 1n,
        noveltyWeightedRestorationDeliveries: 1n,
        evaluationDeliveryCount: 1n,
        multisig: multisig.address,
      }),
    ).to.be.revertedWith('MockMessenger: not owner');
  });

  it('rejects setFixture with multisig=0 (sentinel for unset)', async function () {
    await expect(
      messenger.setFixture(SERVICE_ID, {
        verifiedCreations: 1n,
        noveltyWeightedRestorationDeliveries: 1n,
        evaluationDeliveryCount: 1n,
        multisig: ethers.ZeroAddress,
      }),
    ).to.be.revertedWith('MockMessenger: multisig=0');
  });

  it('emits FixtureSet on setFixture', async function () {
    await expect(
      messenger.setFixture(SERVICE_ID, {
        verifiedCreations: 1n,
        noveltyWeightedRestorationDeliveries: 1n,
        evaluationDeliveryCount: 1n,
        multisig: multisig.address,
      }),
    )
      .to.emit(messenger, 'FixtureSet')
      .withArgs(SERVICE_ID, multisig.address);
  });

  it('owner can transfer ownership; new owner can set fixtures', async function () {
    await expect(messenger.transferOwnership(other.address))
      .to.emit(messenger, 'OwnerTransferred')
      .withArgs(owner.address, other.address);
    expect(await messenger.owner()).to.equal(other.address);

    // Old owner can no longer write.
    await expect(
      messenger.setFixture(SERVICE_ID, {
        verifiedCreations: 1n,
        noveltyWeightedRestorationDeliveries: 1n,
        evaluationDeliveryCount: 1n,
        multisig: multisig.address,
      }),
    ).to.be.revertedWith('MockMessenger: not owner');

    // New owner can.
    await messenger.connect(other).setFixture(SERVICE_ID, {
      verifiedCreations: 99n,
      noveltyWeightedRestorationDeliveries: 88n,
      evaluationDeliveryCount: 77n,
      multisig: multisig.address,
    });
    const proof = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [SERVICE_ID]);
    const result = await messenger.verifyClaim(proof);
    expect(result.verifiedCreations).to.equal(99n);
  });

  it('transferOwnership rejects non-owner and zero address', async function () {
    await expect(
      messenger.connect(other).transferOwnership(other.address),
    ).to.be.revertedWith('MockMessenger: not owner');
    await expect(messenger.transferOwnership(ethers.ZeroAddress)).to.be.revertedWith(
      'MockMessenger: newOwner=0',
    );
  });
});
