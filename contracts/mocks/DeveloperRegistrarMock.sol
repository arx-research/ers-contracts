//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { DeveloperRegistrar } from "../DeveloperRegistrar.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IDeveloperRegistry } from "../interfaces/IDeveloperRegistry.sol";
import { IServicesRegistry } from "../interfaces/IServicesRegistry.sol";

contract DeveloperRegistrarMock is DeveloperRegistrar {

    constructor(
        IChipRegistry _chipRegistry,
        IERS _ers,
        IDeveloperRegistry _developerRegistry,
        IServicesRegistry _servicesRegistry
    )
        DeveloperRegistrar(
            _chipRegistry,
            _ers,
            _developerRegistry,
            _servicesRegistry
        )
    {}

    function addMaliciousProject(address _projectRegistrar, bytes32 _projectRootNode) external {
        projects.push(_projectRegistrar);
        projectIndex[_projectRegistrar] = projects.length - 1;
        emit ProjectAdded(_projectRegistrar, _projectRootNode);
    }
}
