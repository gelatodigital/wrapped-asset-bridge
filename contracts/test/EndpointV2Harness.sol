// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {
    EndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/EndpointV2.sol";
import {
    SimpleMessageLib
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/SimpleMessageLib.sol";

contract EndpointV2Harness is EndpointV2 {
    SimpleMessageLib public msgLib;
    constructor(uint32 _eid, address _owner) EndpointV2(_eid, _owner) {}
}

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TreasuryMock is Ownable {
    function withdraw() external onlyOwner {
        //withdraw
    }

    function withdrawAlt() external onlyOwner {
        //withdraw token
    }
}
