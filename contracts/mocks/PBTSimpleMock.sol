//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { PBTSimple } from "../token/PBTSimple.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

contract PBTSimpleMock is PBTSimple {
    address public owner;

    constructor(string memory _name, string memory _symbol, string memory _baseURI, uint256 maxBlockWindow, ITransferPolicy _transferPolicy) 
        PBTSimple(_name, _symbol, _baseURI, maxBlockWindow, _transferPolicy)
    {
        owner = msg.sender;
    }

    function testMint(
        address _to,
        address _chipId,
        bytes32 _ersNode
    ) external {
        _mint(_to, _chipId, _ersNode);
    }

    function setTransferPolicy(
        ITransferPolicy _newPolicy
    )
        public
    {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _setTransferPolicy(_newPolicy);
    }
}
