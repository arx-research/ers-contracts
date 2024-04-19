//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IDeveloperRegistry } from "../interfaces/IDeveloperRegistry.sol";
import { PBTSimpleProjectRegistrar } from "./PBTSimpleProjectRegistrar.sol";

/**
 * @title PBTSimpleProjectRegistrarFactory
 * @author Arx
 *
 * @notice Contract used to deploy new PBTSimpleProjectRegistrars. Callable only by a DeveloperRegistrar.
 */
contract PBTSimpleProjectRegistrarFactory {

    /* ============ Events ============ */
    event ProjectRegistrarDeployed(address indexed projectRegistrar, address indexed owner);

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
    function deployProjectRegistrar(address _owner)
        external
        returns(address)
    {
        require(developerRegistry.isDeveloperRegistrar(msg.sender), "Must be Developer Registrar");

        PBTSimpleProjectRegistrar newRegistrar = new PBTSimpleProjectRegistrar(_owner, chipRegistry, ers, developerRegistry);
        emit ProjectRegistrarDeployed(address(newRegistrar), _owner);
        return address(newRegistrar);
    }
}