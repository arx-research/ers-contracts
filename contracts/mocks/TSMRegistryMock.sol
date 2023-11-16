//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { TSMRegistry } from "../TSMRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";

contract TSMRegistryMock is TSMRegistry {

    constructor(address _governance) 
        TSMRegistry(_governance)
    {}

    function addMockRegistrar(address _newRegistrar, bytes32 _nameHash) external {
        ersRegistry.createSubnodeRecord(ROOT_NODE, _nameHash, _newRegistrar, _newRegistrar);
        
        isTSMRegistrar[_newRegistrar] = true;
        tsmRegistrars.push(_newRegistrar);
    }
}
