// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import {
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LzLib} from "./vendor/layerzerolabs/libraries/LzLib.sol";
import {TokenBridgeBaseUpgradeable} from "./TokenBridgeBaseUpgradeable.sol";
import {IWrappedERC20} from "./interfaces/IWrappedERC20.sol";

/// @dev Mints a wrapped token when a message received from a remote chain and burns a wrapped token when bridging to a remote chain
contract WrappedTokenBridge is TokenBridgeBaseUpgradeable {
    /// @notice Total bps representing 100%
    uint16 public constant TOTAL_BPS = 10000;

    /// @notice An optional fee charged on withdrawal, expressed in bps. E.g., 1bps = 0.01%
    uint16 public withdrawalFeeBps;

    /// @notice Tokens that can be bridged
    /// @dev [local token] => [remote chain] => [remote token]
    mapping(address => mapping(uint32 => address)) public localToRemote;

    /// @notice Tokens that can be bridged
    /// @dev [remote token] => [remote chain] => [local token]
    mapping(address => mapping(uint32 => address)) public remoteToLocal;

    /// @notice Total value bridged per token and remote chains
    /// @dev [remote chain] => [remote token] => [bridged amount]
    mapping(uint32 => mapping(address => uint256)) public totalValueLocked;

    event WrapToken(
        address localToken,
        address remoteToken,
        uint32 remoteEid,
        address to,
        uint256 amount
    );
    event UnwrapToken(
        address localToken,
        address remoteToken,
        uint32 remoteEid,
        address to,
        uint256 amount
    );
    event RegisterToken(
        address localToken,
        uint32 remoteEid,
        address remoteToken
    );
    event SetWithdrawalFeeBps(uint16 withdrawalFeeBps);

    constructor(address _endpoint) TokenBridgeBaseUpgradeable(_endpoint) {}

    function initialize() external initializer {
        __TokenBridgeBase_init();
    }

    function registerToken(
        address _localToken,
        uint16 _remoteEid,
        address _remoteToken
    ) external onlyProxyAdmin {
        require(
            _localToken != address(0),
            "WrappedTokenBridge: invalid local token"
        );
        require(
            _remoteToken != address(0),
            "WrappedTokenBridge: invalid remote token"
        );
        require(
            localToRemote[_localToken][_remoteEid] == address(0) &&
                remoteToLocal[_remoteToken][_remoteEid] == address(0),
            "WrappedTokenBridge: token already registered"
        );

        localToRemote[_localToken][_remoteEid] = _remoteToken;
        remoteToLocal[_remoteToken][_remoteEid] = _localToken;
        emit RegisterToken(_localToken, _remoteEid, _remoteToken);
    }

    function setWithdrawalFeeBps(
        uint16 _withdrawalFeeBps
    ) external onlyProxyAdmin {
        require(
            _withdrawalFeeBps < TOTAL_BPS,
            "WrappedTokenBridge: invalid withdrawal fee bps"
        );
        withdrawalFeeBps = _withdrawalFeeBps;
        emit SetWithdrawalFeeBps(_withdrawalFeeBps);
    }

    /// @notice Bridges `localToken` to the remote chain
    /// @dev Burns wrapped tokens and sends LZ message to the remote chain to unlock original tokens
    function bridge(
        address _localToken,
        uint16 _remoteEid,
        uint256 _amount,
        address _to,
        bool _unwrapWeth,
        bytes memory _options,
        address _refundAddress
    ) external payable nonReentrant {
        require(_localToken != address(0), "WrappedTokenBridge: invalid token");
        require(_to != address(0), "WrappedTokenBridge: invalid to");
        require(_amount > 0, "WrappedTokenBridge: invalid amount");

        address remoteToken = localToRemote[_localToken][_remoteEid];
        require(
            remoteToken != address(0),
            "WrappedTokenBridge: token is not supported"
        );
        require(
            totalValueLocked[_remoteEid][remoteToken] >= _amount,
            "WrappedTokenBridge: insufficient liquidity on the destination"
        );

        totalValueLocked[_remoteEid][remoteToken] -= _amount;
        _burn(_localToken, msg.sender, _amount);

        uint256 withdrawalAmount = _amount;
        if (withdrawalFeeBps > 0) {
            uint256 withdrawalFee = (_amount * withdrawalFeeBps) / TOTAL_BPS;
            withdrawalAmount -= withdrawalFee;
        }

        bytes memory message = abi.encode(
            PT_UNLOCK,
            remoteToken,
            _to,
            withdrawalAmount,
            _amount,
            _unwrapWeth
        );
        _lzSend(
            _remoteEid,
            message,
            _options,
            MessagingFee(msg.value, 0),
            _refundAddress
        );
        emit UnwrapToken(_localToken, remoteToken, _remoteEid, _to, _amount);
    }

    /// @notice Receives ERC20 tokens or ETH from the remote chain
    /// @dev Mints wrapped tokens in response to LZ message from the remote chain
    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override {
        (
            uint8 packetType,
            address remoteToken,
            address to,
            uint256 amount
        ) = abi.decode(_message, (uint8, address, address, uint256));
        require(
            packetType == PT_MINT,
            "WrappedTokenBridge: unknown packet type"
        );

        address localToken = remoteToLocal[remoteToken][_origin.srcEid];
        require(
            localToken != address(0),
            "WrappedTokenBridge: token is not supported"
        );

        totalValueLocked[_origin.srcEid][remoteToken] += amount;
        IWrappedERC20(localToken).mint(to, amount);

        emit WrapToken(localToken, remoteToken, _origin.srcEid, to, amount);
    }

    /// @notice Transfers WrappedERC20 to bridge before burning.
    /// @dev This requires allowance to burn WrappedERC20.
    function _burn(
        address _localToken,
        address _from,
        uint256 _amount
    ) internal {
        IWrappedERC20 token = IWrappedERC20(_localToken);

        token.transferFrom(_from, address(this), _amount);
        token.burn(address(this), _amount);
    }
}
