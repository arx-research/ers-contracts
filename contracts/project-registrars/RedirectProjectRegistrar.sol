//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { BaseProjectRegistrar } from "./BaseProjectRegistrar.sol";
import { ChipValidations } from "../lib/ChipValidations.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";

/**
 * @title RedirectProjectRegistrar
 * @author Arx Research
 * 
 * @notice Entry point to claim chips for projects that only want to use the protocol for chip URL redirects and verification of
 * manufacturing by a trusted party. Chip claims can only be performed by the project manager. This registrar should be used by
 * projects that do not care about tracking the full chain of custody of their chips via ERSRegistry.
 */
contract RedirectProjectRegistrar is BaseProjectRegistrar {
    using ChipValidations for address;

    /* ============ Structs ============ */
    struct ProjectChipAddition {
        address chipId;
        bytes32 chipNameHash;
        IChipRegistry.DeveloperMerkleInfo developerMerkleInfo;
        IChipRegistry.ManufacturerValidation manufacturerValidation;
    }

    /* ============ Constructor ============ */
    /**
     * @param _projectManager           The address that will be set as the owner
     * @param _chipRegistry             The chip registry of the ERS system being used
     * @param _ers                      The ERS registry of the ERS system being used
     * @param _developerRegistrar       The DeveloperRegistrar that made this project
     */
    constructor(
        address _projectManager, 
        IChipRegistry _chipRegistry, 
        IERS _ers, 
        IDeveloperRegistrar _developerRegistrar
    ) 
        BaseProjectRegistrar(
            _projectManager,
            _chipRegistry,
            _ers,
            _developerRegistrar
        )
    {}

    /* ============ External Functions ============ */
    /**
     * @notice ONLY OWNER: Allow the project manager to claim chips for the project. Intended to be used for chips
     * that are meant to be redirected to a URL and not concerned with tracking the full chain of custody. This
     * gives managers to ability to maintain ownership over the chips (and thus the primaryService) for as long
     * as they want.
     * 
     * @param _claimData    Array of information needed for claiming chips
     */
    function claimChips(
        ProjectChipAddition[] calldata _claimData
    ) 
        external
        onlyOwner()
    {
        for (uint256 i = 0; i < _claimData.length; i++) {
            ProjectChipAddition memory claim = _claimData[i];
            _createSubnodeAndAddChip(
                claim.chipId,
                claim.chipNameHash,
                msg.sender,
                claim.developerMerkleInfo,
                claim.manufacturerValidation
            );
        }
    }
}



