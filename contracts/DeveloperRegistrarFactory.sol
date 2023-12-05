//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";
import { DeveloperRegistrar } from "./DeveloperRegistrar.sol";

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

    /* ============ Constructor ============ */
    constructor(IChipRegistry _chipRegistry, IERS _ers, IDeveloperRegistry _developerRegistry) {
        chipRegistry = _chipRegistry;
        ers = _ers;
        developerRegistry = _developerRegistry;
    }

    /* ============ External Functions ============ */
    function deployRegistrar(address _owner)
        external
        returns(address)
    {
        require(IDeveloperRegistry(msg.sender) == developerRegistry, "Caller must be DeveloperRegistry");

        DeveloperRegistrar newRegistrar = new DeveloperRegistrar(_owner, chipRegistry, ers, developerRegistry);
        emit DeveloperRegistrarDeployed(address(newRegistrar), _owner);
        return address(newRegistrar);
    }
}
