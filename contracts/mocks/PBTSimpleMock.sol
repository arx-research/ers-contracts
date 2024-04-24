//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { PBTSimple } from "../token/PBTSimple.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

contract ChipPBTMock is PBTSimple {

    constructor(string memory _name, string memory _symbol, string memory _baseURI, uint256 maxBlockWindow, ITransferPolicy _transferPolicy) 
        PBTSimple(_name, _symbol, _baseURI, maxBlockWindow, _transferPolicy)
    {}

    function testMint(
        address _to,
        address _chipId,
        bytes32 _ersNode
    ) external {
        _mint(_to, _chipId, _ersNode);
    }
}
