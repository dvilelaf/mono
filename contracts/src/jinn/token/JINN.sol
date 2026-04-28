// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title JINN
/// @notice ERC20Votes governance token for the Jinn protocol. A single minter
///         (typically the JinnDistributor) is authorised to mint; ownership is
///         held by an OZ Timelock and managed via two-step transfers.
contract JINN is ERC20, ERC20Permit, ERC20Votes, Ownable2Step {
    /// @notice Address authorised to mint new JINN; zero disables minting.
    address public minter;

    /// @notice Emitted whenever the minter is updated (including unsetting).
    event MinterUpdated(address indexed newMinter);

    /// @notice Thrown when a non-minter attempts to call {mint}.
    error NotMinter(address sender);

    constructor(address initialOwner)
        ERC20("Jinn", "JINN")
        ERC20Permit("Jinn")
        Ownable(initialOwner)
    {}

    /// @notice Mint new JINN tokens. Restricted to the configured minter.
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) {
            revert NotMinter(msg.sender);
        }
        _mint(to, amount);
    }

    /// @notice Set or unset the minter. Owner only.
    function setMinter(address newMinter) external onlyOwner {
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    // -------------------------------------------------------------------------
    // OpenZeppelin v5 multiple-inheritance overrides
    // -------------------------------------------------------------------------

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
