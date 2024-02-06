// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import {
    MessagingFee
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {OAppUpgradeable} from "./vendor/layerzerolabs/oapp/OAppUpgradeable.sol";

/// @dev An abstract contract containing a common functionality used by OriginalTokenBridge and WrappedTokenBridge
abstract contract TokenBridgeBaseUpgradeable is
    OAppUpgradeable,
    ReentrancyGuardUpgradeable
{
    /// @notice A packet type used to identify messages requesting minting of wrapped tokens
    uint8 public constant PT_MINT = 0;

    /// @notice A packet type used to identify messages requesting unlocking of original tokens
    uint8 public constant PT_UNLOCK = 1;

    constructor(address _endpoint) OAppUpgradeable(_endpoint) {}

    function __TokenBridgeBase_init() internal onlyInitializing {
        __ReentrancyGuard_init_unchained();
    }

    function quote(
        uint32 _remoteEid,
        bool _payInLzToken,
        bytes calldata _options
    ) external view returns (MessagingFee memory fee) {
        // Only the message format matters when estimating fee, not the actual data
        bytes memory message = abi.encode(
            PT_MINT,
            address(this),
            address(this),
            0
        );

        return _quote(_remoteEid, message, _options, _payInLzToken);
    }
}
