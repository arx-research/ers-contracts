//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { IPBT } from "../token/IPBT.sol";

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
        bytes32 nodeLabel,
        IChipRegistry.ManufacturerValidation calldata _manufacturerValidation
    )
        external
    {
        // NOTE: Don't use in prod. We are passing in the "label" in the ChipAddition struct then over-writing for
        // testing convenience.

        chipRegistry.addChip(
            chipId,
            chipOwner,
            nodeLabel,
            _manufacturerValidation
        );
    }

     /**
     * 
     * @param _interfaceId The interface ID to check for
     */
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        returns (bool)
    {
        return
            _interfaceId == type(IProjectRegistrar).interfaceId ||
            _interfaceId == type(IPBT).interfaceId;
    }
}
