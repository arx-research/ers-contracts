//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";

/**
 * @title DeveloperRegistrarFactory
 * @author Arx
 *
 * @notice Contract used to deploy new DeveloperRegistrars. Callable only by the DeveloperRegistry.
 */
contract DeveloperRegistrarFactory {

    /* ============ Events ============ */
    event DeveloperRegistrarDeployed(address indexed developerRegistrar);

    /* ============ State Variables ============ */
    address public immutable developerRegistrar;
    IDeveloperRegistry public immutable developerRegistry;

    /* ============ Constructor ============ */
    constructor(address _developerRegistrar, IDeveloperRegistry _developerRegistry) {
        developerRegistrar = _developerRegistrar;
        developerRegistry = _developerRegistry;
    }

    /* ============ External Functions ============ */
    function deployDeveloperRegistrar()
        external
        returns(address)
    {
        require(IDeveloperRegistry(msg.sender) == developerRegistry, "Caller must be DeveloperRegistry");

        address newRegistrar = Clones.clone(developerRegistrar);
        emit DeveloperRegistrarDeployed(address(newRegistrar));
        return address(newRegistrar);
    }
}
