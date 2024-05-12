//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { BaseProjectRegistrar } from "../project-registrars/BaseProjectRegistrar.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IPBT } from "../token/IPBT.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";
import { PBTSimpleMock } from "./PBTSimpleMock.sol";

contract ProjectRegistrarMock is BaseProjectRegistrar, PBTSimpleMock {

    /* ============ Structs ============ */
    struct ProjectChipAddition {
        address chipId;
        address chipOwner;
        bytes32 nameHash; // A label used to identify the chip; in a PBT imlementation, this might match the tokenId
        IChipRegistry.ManufacturerValidation manufacturerValidation;
        bytes custodyProof;
    }

    constructor(IChipRegistry _chipRegistry, IERS _ers, IDeveloperRegistrar _developerRegistrar)
        BaseProjectRegistrar(_chipRegistry, _ers, _developerRegistrar)
        PBTSimpleMock("SimplePBT", "PBT", "pbt.com", 5, ITransferPolicy(address(0)))
    {}

    /**
     * @notice ONLY OWNER: Allow the project manager to add chips to the project.
     * 
     * @param _chips    Array of information needed for claiming chips
     */
    function addChips(
        ProjectChipAddition[] calldata _chips
    ) 
        external
        onlyOwner()
    {
        for (uint256 i = 0; i < _chips.length; i++) {
            ProjectChipAddition memory chip = _chips[i];
            _addChip(
                chip.chipId,
                chip.chipOwner,
                chip.nameHash,
                chip.manufacturerValidation,
                chip.custodyProof
            );
            _mint(chip.chipOwner, chip.chipId, chip.nameHash);
        }
    }

    function setChipNodeOwnerMock(
        address _chipId,
        address _newOwner
    )
        external
        onlyOwner()
    {
        chipRegistry.setChipNodeOwner(_chipId, _newOwner);
    }

    function supportsInterface(bytes4 _interfaceId)
        public
        view
        override(BaseProjectRegistrar, PBTSimpleMock)
        returns (bool)
    {
        return
            _interfaceId == type(IProjectRegistrar).interfaceId ||
            _interfaceId == type(IPBT).interfaceId ||
            super.supportsInterface(_interfaceId);
    }
}
