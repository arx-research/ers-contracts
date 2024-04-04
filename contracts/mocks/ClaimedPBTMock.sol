//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ChipPBT } from "../token/ChipPBT.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

contract ChipPBTMock is ChipPBT {

    constructor(string memory _name, string memory _symbol, uint256 maxBlockWindow, string memory _baseTokenUri) 
        ChipPBT(_name, _symbol, maxBlockWindow, _baseTokenUri)
    {}

    function testMint(
        address _to,
        address _chipId,
        ITransferPolicy _transferPolicy
    ) external {
        _mint(_to, _chipId, _transferPolicy);
    }
}
