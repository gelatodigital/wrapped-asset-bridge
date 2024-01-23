// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./EIP173Proxy.sol";

/**
 * @notice Proxy implementing EIP173 for ownership management
 * that accepts ETH depending on it's implementation.
 */
contract EIP173ProxyWithCustomReceive is EIP173Proxy {
    constructor(
        address implementationAddress,
        address ownerAddress,
        bytes memory data
    ) payable EIP173Proxy(implementationAddress, ownerAddress, data) {}

    receive() external payable override {
        _fallback();
    }
}
