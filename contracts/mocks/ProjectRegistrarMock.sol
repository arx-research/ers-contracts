//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";

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

    function claimChip(
        bytes32 _nameHash,
        address chipOwner,
        IChipRegistry.DeveloperMerkleInfo calldata _claimData,
        IChipRegistry.ManufacturerValidation calldata _manufacturerValidation
    )
        external
    {
        // NOTE: Don't use in prod. We are passing in the "label" in the ChipClaim struct then over-writing for
        // testing convenience.
        bytes32 chipErsNode = ers.createSubnodeRecord(
            rootNode,
            _nameHash,
            chipOwner,
            msg.sender
        );

        IChipRegistry.ChipClaim memory chipClaim = IChipRegistry.ChipClaim({
            owner: chipOwner,
            ersNode: chipErsNode,
            developerMerkleInfo: _claimData
        });

        chipRegistry.addChip(
            msg.sender,
            chipClaim,
            _manufacturerValidation
        );
    }
}
