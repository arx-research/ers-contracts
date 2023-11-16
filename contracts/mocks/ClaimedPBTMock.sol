//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ClaimedPBT } from "../token/ClaimedPBT.sol";

contract ClaimedPBTMock is ClaimedPBT {

    constructor(string memory _name, string memory _symbol, uint256 maxBlockWindow) 
        ClaimedPBT(_name, _symbol, maxBlockWindow)
    {}

    function testMint(
        address _to,
        address _chipId,
        ChipInfo memory  _chipInfo
    ) external {
        _mint(_to, _chipId, _chipInfo);
    }
}
