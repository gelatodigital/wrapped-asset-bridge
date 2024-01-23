// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {EIP173Proxy} from "./EIP173Proxy.sol";

/**
 * @notice EIP173Proxy with a transfer and accept ownership transfer process.
 *
 * @dev stores pendingOwner in keccak256('EIP173Proxy2Step.pendingOwner')
 */
contract EIP173Proxy2Step is EIP173Proxy {
    event OwnershipTransferStarted(
        address indexed previousOwner,
        address indexed newOwner
    );

    constructor(
        address implementationAddress,
        address ownerAddress,
        bytes memory data
    ) payable EIP173Proxy(implementationAddress, ownerAddress, data) {}

    /**
     * @dev Starts the ownership transfer of the contract to a new account.
     * Replaces the pending transfer if there is one.
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        assembly {
            sstore(
                0xd7f78f8b67faea299a16a1a65ab369a98590ff454f97f11fec3531f3d52efb8c,
                newOwner
            )
        }

        emit OwnershipTransferStarted(_owner(), newOwner);
    }

    /**
     * @dev The new owner accepts the ownership transfer.
     */
    function acceptOwnership() public virtual {
        address sender = msg.sender;
        require(sender == pendingOwner(), "NOT_PENDING_OWNER");

        super._setOwner(sender);

        assembly {
            sstore(
                0xd7f78f8b67faea299a16a1a65ab369a98590ff454f97f11fec3531f3d52efb8c,
                0
            )
        }
    }

    /**
     * @dev Returns the address of the pending owner.
     */
    function pendingOwner() public view virtual returns (address) {
        address _pendingOwner;

        assembly {
            _pendingOwner := sload(
                0xd7f78f8b67faea299a16a1a65ab369a98590ff454f97f11fec3531f3d52efb8c
            )
        }
        return _pendingOwner;
    }
}
