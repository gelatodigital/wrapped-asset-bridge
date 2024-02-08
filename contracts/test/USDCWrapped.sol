// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {WrappedERC20} from "../WrappedERC20.sol";

contract USDCWrapped is WrappedERC20 {
    constructor(
        address _bridge
    ) WrappedERC20(_bridge, "USD Coin Wrapped", "USDC.W", 6) {}
}
