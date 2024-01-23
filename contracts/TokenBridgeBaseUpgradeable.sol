// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {
    NonblockingLzAppUpgradeable
} from "./vendor/layerzerolabs/lzApp/NonblockingLzAppUpgradeable.sol";

/// @dev An abstract contract containing a common functionality used by OriginalTokenBridge and WrappedTokenBridge
abstract contract TokenBridgeBaseUpgradeable is
    NonblockingLzAppUpgradeable,
    ReentrancyGuardUpgradeable
{
    /// @notice A packet type used to identify messages requesting minting of wrapped tokens
    uint8 public constant PT_MINT = 0;

    /// @notice A packet type used to identify messages requesting unlocking of original tokens
    uint8 public constant PT_UNLOCK = 1;

    bool public useCustomAdapterParams;

    event SetUseCustomAdapterParams(bool useCustomAdapterParams);

    constructor(address _endpoint) NonblockingLzAppUpgradeable(_endpoint) {}

    function __TokenBridgeBase_init() internal onlyInitializing {
        __ReentrancyGuard_init_unchained();
    }

    /// @notice Sets the `useCustomAdapterParams` flag indicating whether the contract uses custom adapter parameters or the default ones
    /// @dev Can be called only by the bridge owner
    function setUseCustomAdapterParams(
        bool _useCustomAdapterParams
    ) external onlyProxyAdmin {
        useCustomAdapterParams = _useCustomAdapterParams;
        emit SetUseCustomAdapterParams(_useCustomAdapterParams);
    }

    /// @dev Checks `adapterParams` for correctness
    function _checkAdapterParams(
        uint16 dstChainId,
        uint16 pkType,
        bytes memory adapterParams
    ) internal virtual {
        if (useCustomAdapterParams) {
            _checkGasLimit(dstChainId, pkType, adapterParams, 0);
        } else {
            require(
                adapterParams.length == 0,
                "TokenBridgeBase: adapterParams must be empty"
            );
        }
    }
}
