//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { ITSMRegistry } from "./interfaces/ITSMRegistry.sol";
import { TSMRegistrar } from "./TSMRegistrar.sol";

/**
 * @title TSMRegistrarFactory
 * @author Arx
 *
 * @notice Contract used to deploy new TSMRegistrars. Callable only by the TSMRegistry.
 */
contract TSMRegistrarFactory {

    /* ============ Events ============ */
    event TSMRegistrarDeployed(address indexed tsmRegistrar, address indexed owner);

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry;
    IERS public immutable ers;
    ITSMRegistry public immutable tsmRegistry;

    /* ============ Constructor ============ */
    constructor(IChipRegistry _chipRegistry, IERS _ers, ITSMRegistry _tsmRegistry) {
        chipRegistry = _chipRegistry;
        ers = _ers;
        tsmRegistry = _tsmRegistry;
    }

    /* ============ External Functions ============ */
    function deployRegistrar(address _owner)
        external
        returns(address)
    {
        require(ITSMRegistry(msg.sender) == tsmRegistry, "Caller must be TSMRegistry");

        TSMRegistrar newRegistrar = new TSMRegistrar(_owner, chipRegistry, ers, tsmRegistry);
        emit TSMRegistrarDeployed(address(newRegistrar), _owner);
        return address(newRegistrar);
    }
}
