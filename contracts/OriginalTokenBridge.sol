// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import {
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {LzLib} from "./vendor/layerzerolabs/libraries/LzLib.sol";
import {TokenBridgeBaseUpgradeable} from "./TokenBridgeBaseUpgradeable.sol";
import {IWETH} from "./interfaces/IWETH.sol";

/// @dev Locks an ERC20 on the source chain and sends LZ message to the remote chain to mint a wrapped token
contract OriginalTokenBridge is TokenBridgeBaseUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Tokens that can be bridged to the remote chain
    mapping(address => bool) public supportedTokens;

    /// @notice Token conversion rates from local decimals (LD) to shared decimals (SD).
    /// E.g., if local decimals is 18 and shared decimals is 6, the conversion rate is 10^12
    mapping(address => uint256) public LDtoSDConversionRate;

    /// @notice Total value locked per each supported token in shared decimals
    mapping(address => uint256) public totalValueLockedSD;

    /// @notice LayerZero id of the remote chain where wrapped tokens are minted
    uint32 public remoteEid;

    /// @notice Address of the wrapped native gas token (e.g. WETH, WBNB, WMATIC)
    address public immutable weth;

    event SendToken(address token, address from, address to, uint256 amount);
    event ReceiveToken(address token, address to, uint256 amount);
    event SetRemoteEid(uint32 remoteEid);
    event RegisterToken(address token);
    event WithdrawFee(address indexed token, address to, uint256 amount);

    constructor(
        address _endpoint,
        address _weth
    ) TokenBridgeBaseUpgradeable(_endpoint) {
        require(
            _weth != address(0),
            "OriginalTokenBridge: invalid WETH address"
        );
        weth = _weth;
    }

    function initialize(uint32 _remoteEid) external initializer {
        __TokenBridgeBase_init();
        remoteEid = _remoteEid;
    }

    /// @notice Registers a token for bridging
    /// @param _token address of the token
    /// @param _sharedDecimals number of decimals used for all original tokens mapped to the same wrapped token.
    /// E.g., 6 is shared decimals for USDC on Ethereum, BSC and Polygon
    function registerToken(
        address _token,
        uint8 _sharedDecimals
    ) external onlyProxyAdmin {
        require(
            _token != address(0),
            "OriginalTokenBridge: invalid token address"
        );
        require(
            !supportedTokens[_token],
            "OriginalTokenBridge: token already registered"
        );

        uint8 localDecimals = _getTokenDecimals(_token);
        require(
            localDecimals >= _sharedDecimals,
            "OriginalTokenBridge: shared decimals must be less than or equal to local decimals"
        );

        supportedTokens[_token] = true;
        LDtoSDConversionRate[_token] = 10 ** (localDecimals - _sharedDecimals);
        emit RegisterToken(_token);
    }

    function setRemoteEid(uint32 _remoteEid) external onlyProxyAdmin {
        remoteEid = _remoteEid;
        emit SetRemoteEid(_remoteEid);
    }

    function accruedFeeLD(address _token) public view returns (uint256) {
        return
            IERC20(_token).balanceOf(address(this)) -
            _amountSDtoLD(_token, totalValueLockedSD[_token]);
    }

    /// @notice Bridges ERC20 to the remote chain
    /// @dev Locks an ERC20 on the source chain and sends LZ message to the remote chain to mint a wrapped token
    function bridge(
        address _token,
        uint256 _amountLD,
        address _to,
        bytes memory _options,
        address _refundAddress
    ) external payable nonReentrant {
        require(
            supportedTokens[_token],
            "OriginalTokenBridge: token is not supported"
        );

        // Supports tokens with transfer fee
        uint256 balanceBefore = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amountLD);
        uint256 balanceAfter = IERC20(_token).balanceOf(address(this));
        (uint256 amountWithoutDustLD, uint256 dust) = _removeDust(
            _token,
            balanceAfter - balanceBefore
        );

        // return dust to the sender
        if (dust > 0) {
            IERC20(_token).safeTransfer(msg.sender, dust);
        }
        _bridge(
            _token,
            amountWithoutDustLD,
            _to,
            msg.value,
            _options,
            _refundAddress
        );
    }

    /// @notice Bridges native gas token (e.g. ETH) to the remote chain
    /// @dev Locks WETH on the source chain and sends LZ message to the remote chain to mint a wrapped token
    function bridgeNative(
        uint256 _amountLD,
        address _to,
        bytes memory _options,
        address _refundAddress
    ) external payable nonReentrant {
        require(
            supportedTokens[weth],
            "OriginalTokenBridge: token is not supported"
        );
        require(
            msg.value >= _amountLD,
            "OriginalTokenBridge: not enough value sent"
        );
        (uint256 amountWithoutDustLD, ) = _removeDust(weth, _amountLD);
        IWETH(weth).deposit{value: amountWithoutDustLD}();
        _bridge(
            weth,
            amountWithoutDustLD,
            _to,
            msg.value - amountWithoutDustLD,
            _options,
            _refundAddress
        );
    }

    function _bridge(
        address _token,
        uint256 _amountLD,
        address _to,
        uint256 _nativeFee,
        bytes memory _options,
        address _refundAddress
    ) private {
        require(_to != address(0), "OriginalTokenBridge: invalid to");

        uint256 amountSD = _amountLDtoSD(_token, _amountLD);
        require(amountSD > 0, "OriginalTokenBridge: invalid amount");

        totalValueLockedSD[_token] += amountSD;
        bytes memory message = abi.encode(PT_MINT, _token, _to, amountSD);

        _lzSend(
            remoteEid,
            message,
            _options,
            MessagingFee(_nativeFee, 0),
            _refundAddress
        );
        emit SendToken(_token, msg.sender, _to, _amountLD);
    }

    function withdrawFee(
        address _token,
        address _to,
        uint256 _amountLD
    ) public onlyProxyAdmin {
        uint256 feeLD = accruedFeeLD(_token);
        require(
            _amountLD <= feeLD,
            "OriginalTokenBridge: not enough fees collected"
        );

        IERC20(_token).safeTransfer(_to, _amountLD);
        emit WithdrawFee(_token, _to, _amountLD);
    }

    /// @notice Receives ERC20 tokens or ETH from the remote chain
    /// @dev Unlocks locked ERC20 tokens or ETH in response to LZ message from the remote chain
    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override {
        require(
            _origin.srcEid == remoteEid,
            "OriginalTokenBridge: invalid source chain id"
        );

        (
            uint8 packetType,
            address token,
            address to,
            uint256 withdrawalAmountSD,
            uint256 totalAmountSD,
            bool unwrapWeth
        ) = abi.decode(
                _message,
                (uint8, address, address, uint256, uint256, bool)
            );
        require(
            packetType == PT_UNLOCK,
            "OriginalTokenBridge: unknown packet type"
        );
        require(
            supportedTokens[token],
            "OriginalTokenBridge: token is not supported"
        );

        totalValueLockedSD[token] -= totalAmountSD;
        uint256 withdrawalAmountLD = _amountSDtoLD(token, withdrawalAmountSD);

        if (token == weth && unwrapWeth) {
            IWETH(weth).withdraw(withdrawalAmountLD);
            (bool success, ) = payable(to).call{value: withdrawalAmountLD}("");
            require(success, "OriginalTokenBridge: failed to send");
            emit ReceiveToken(address(0), to, withdrawalAmountLD);
        } else {
            IERC20(token).safeTransfer(to, withdrawalAmountLD);
            emit ReceiveToken(token, to, withdrawalAmountLD);
        }
    }

    /**
     * @dev Overrides OAppSenderUpgradeable._payNative
     * so that msg.value can be >= nativeFee for bridgeNative()
     * which will deposit native for wrapped native.
     */
    function _payNative(
        uint256 _nativeFee
    ) internal override returns (uint256 nativeFee) {
        if (msg.value < _nativeFee) revert NotEnoughNative(msg.value);
        return _nativeFee;
    }

    function _getTokenDecimals(address token) internal view returns (uint8) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        require(success, "OriginalTokenBridge: failed to get token decimals");
        return abi.decode(data, (uint8));
    }

    function _amountSDtoLD(
        address _token,
        uint256 _amountSD
    ) internal view returns (uint256) {
        return _amountSD * LDtoSDConversionRate[_token];
    }

    function _amountLDtoSD(
        address _token,
        uint256 _amountLD
    ) internal view returns (uint256) {
        return _amountLD / LDtoSDConversionRate[_token];
    }

    function _removeDust(
        address _token,
        uint256 _amountLD
    ) internal view returns (uint256 amountWithoutDustLD, uint256 dust) {
        dust = _amountLD % LDtoSDConversionRate[_token];
        amountWithoutDustLD = _amountLD - dust;
    }

    /// @dev Allows receiving ETH when calling WETH.withdraw()
    receive() external payable {}
}
