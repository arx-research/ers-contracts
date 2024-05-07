//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { DeveloperRegistrar } from "./DeveloperRegistrar.sol";
import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";
import { IServicesRegistry } from "./interfaces/IServicesRegistry.sol";

/**
 * @title DeveloperRegistrarFactory
 * @author Arx
 *
 * @notice Contract used to deploy new DeveloperRegistrars. Callable only by the DeveloperRegistry.
 */
contract DeveloperRegistrarFactory {

    /* ============ Events ============ */
    event DeveloperRegistrarDeployed(address indexed developerRegistrar, address indexed owner);

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry;
    IERS public immutable ers;
    IDeveloperRegistry public immutable developerRegistry;
    IServicesRegistry public immutable servicesRegistry;

    /* ============ Constructor ============ */
    constructor(IChipRegistry _chipRegistry, IERS _ers, IDeveloperRegistry _developerRegistry, IServicesRegistry _servicesRegistry) {
        chipRegistry = _chipRegistry;
        ers = _ers;
        developerRegistry = _developerRegistry;
        servicesRegistry = _servicesRegistry;
    }

    /* ============ External Functions ============ */
    function deployDeveloperRegistrar(address _owner)
        external
        returns(address)
    {
        require(IDeveloperRegistry(msg.sender) == developerRegistry, "Caller must be DeveloperRegistry");

        DeveloperRegistrar newRegistrar = new DeveloperRegistrar(_owner, chipRegistry, ers, developerRegistry, servicesRegistry);
        emit DeveloperRegistrarDeployed(address(newRegistrar), _owner);
        return address(newRegistrar);
    }
}
