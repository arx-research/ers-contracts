//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";

import "hardhat/console.sol";

contract ProjectRegistrarMock {
    
    IChipRegistry public immutable chipRegistry;
    IERS public immutable ers;

    bytes32 public rootNode;

    constructor(IChipRegistry _chipRegistry, IERS _ers) {
        chipRegistry = _chipRegistry;
        ers = _ers;
    }
    
    function setRootNode(
        bytes32 _rootNode
    )
        external
    {
        rootNode = _rootNode;
    }

    function addChip(
        address chipId,
        address chipOwner,
        IChipRegistry.ManufacturerValidation calldata _manufacturerValidation
    )
        external
    {
        // NOTE: Don't use in prod. We are passing in the "label" in the ChipAddition struct then over-writing for
        // testing convenience.
        console.log("mock called add chip");

        chipRegistry.addChip(
            chipId,
            chipOwner,
            _manufacturerValidation
        );
    }
}
