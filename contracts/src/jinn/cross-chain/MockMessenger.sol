// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IClaimMessenger} from "../interfaces/IClaimMessenger.sol";

/// @title MockMessenger
/// @notice Owner-controlled fixture-injection messenger used for unit
///         tests, local dev, and Phase D testnet burn-in fallback when
///         canonical OP-Stack finality is not yet practical on Base
///         Sepolia. Implements `IClaimMessenger` by decoding `proof`
///         as `abi.encode(uint256 serviceId)` and returning the
///         pre-set fixture for that service.
///
/// @dev    Insecure by design — the owner can mint arbitrary JINN
///         through the JinnDistributor by writing fixtures. NEVER
///         deploy on mainnet.
contract MockMessenger is IClaimMessenger {
    address public owner;

    /// @notice Fixture values for a single service. `multisig == 0`
    ///         is sentinel for "not set"; `verifyClaim` reverts on
    ///         that.
    struct Fixture {
        uint256 verifiedCreations;
        uint256 noveltyWeightedRestorationDeliveries;
        uint256 evaluationDeliveryCount;
        address multisig;
    }

    mapping(uint256 => Fixture) public fixtures;

    event FixtureSet(uint256 indexed serviceId, address indexed multisig);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address _owner) {
        require(_owner != address(0), "MockMessenger: owner=0");
        owner = _owner;
        emit OwnerTransferred(address(0), _owner);
    }

    /// @notice Owner-only fixture write. `verifyClaim` is read-only
    ///         for anyone.
    function setFixture(uint256 serviceId, Fixture calldata f) external {
        require(msg.sender == owner, "MockMessenger: not owner");
        require(f.multisig != address(0), "MockMessenger: multisig=0");
        fixtures[serviceId] = f;
        emit FixtureSet(serviceId, f.multisig);
    }

    /// @notice Owner-only ownership transfer. Useful for handing the
    ///         test fixture from a deployer EOA to a CI account.
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "MockMessenger: not owner");
        require(newOwner != address(0), "MockMessenger: newOwner=0");
        address prev = owner;
        owner = newOwner;
        emit OwnerTransferred(prev, newOwner);
    }

    /// @inheritdoc IClaimMessenger
    /// @dev `proof` is `abi.encode(uint256 serviceId)`. Reverts if no
    ///      fixture has been set for that service.
    function verifyClaim(bytes calldata proof)
        external
        view
        override
        returns (
            uint256 serviceId,
            uint256 verifiedCreations,
            uint256 noveltyWeightedRestorationDeliveries,
            uint256 evaluationDeliveryCount,
            address multisig
        )
    {
        serviceId = abi.decode(proof, (uint256));
        Fixture memory f = fixtures[serviceId];
        require(f.multisig != address(0), "MockMessenger: no fixture");
        return (
            serviceId,
            f.verifiedCreations,
            f.noveltyWeightedRestorationDeliveries,
            f.evaluationDeliveryCount,
            f.multisig
        );
    }
}
