//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { PBTSimple } from "../token/PBTSimple.sol";
import { IPBT } from "../token/IPBT.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

contract PBTSimpleMock is PBTSimple {
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

    function setTransferPolicy(
        ITransferPolicy _newPolicy
    )
        public
    {
        _setTransferPolicy(_newPolicy);
    }

    /**
     * 
     * @param _interfaceId The interface ID to check for
     */
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        override(PBTSimple)
        virtual
        returns (bool)
    {
        return
            _interfaceId == type(IPBT).interfaceId ||
            super.supportsInterface(_interfaceId);
    }
}
