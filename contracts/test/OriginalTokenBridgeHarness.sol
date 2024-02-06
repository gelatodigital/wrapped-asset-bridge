// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import {
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {OriginalTokenBridge} from "../OriginalTokenBridge.sol";

/// @dev used only in unit tests to call internal _nonblockingLzReceive
contract OriginalTokenBridgeHarness is OriginalTokenBridge {
    constructor(
        address _endpoint,
        address _weth
    ) OriginalTokenBridge(_endpoint, _weth) {}

    function simulateLzReceive(
        Origin calldata _origin,
        bytes calldata _message
    ) external {
        _lzReceive(_origin, bytes32(""), _message, address(0), _message);
    }
}
