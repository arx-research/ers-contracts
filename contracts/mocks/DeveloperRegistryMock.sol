//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { DeveloperRegistry } from "../DeveloperRegistry.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";
import { IERS } from "../interfaces/IERS.sol";

contract DeveloperRegistryMock is DeveloperRegistry {

    constructor(address _governance) 
        DeveloperRegistry(_governance)
    {}

    function addMockRegistrar(address _newRegistrar, bytes32 _nameHash) external {
        bytes32 registrarRootNode = ersRegistry.createSubnodeRecord(ROOT_NODE, _nameHash, _newRegistrar, _newRegistrar);
        
        IDeveloperRegistrar(_newRegistrar).initialize(msg.sender, registrarRootNode);

        isDeveloperRegistrar[_newRegistrar] = true;
        developerRegistrars.push(_newRegistrar);
    }
}
