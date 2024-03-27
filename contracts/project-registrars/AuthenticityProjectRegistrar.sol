//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { BaseProjectRegistrar } from "./BaseProjectRegistrar.sol";
import { ChipValidations } from "../lib/ChipValidations.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";

/**
 * @title AuthenticityProjectRegistrar
 * @author Arx Research
 * 
 * @notice Entry point for users claiming chips. Responsible for setting the ers name for each chip in its enrollment as [chip].project.developer.ers.
 * The Developer Registrar sets the root node of the ProjectRegistrar when addProject is called on the DeveloperRegistrar. This regostrar should be
 * used by projects that care about tracking the full chain of custody of their chips via ERSRegistry. If project only wants to use the protocol for
 * chip URL redirects other ProjectRegistrars may be a better fit.
 */
contract AuthenticityProjectRegistrar is BaseProjectRegistrar {
    using ChipValidations for address;

    /* ============ State Variables ============ */
    uint256 public immutable maxBlockWindow;

    /* ============ Constructor ============ */
    /**
     * @param _projectManager           The address that will be set as the owner
     * @param _chipRegistry             The chip registry of the ERS system being used
     * @param _ers                      The ERS registry of the ERS system being used
     * @param _developerRegistrar       The DeveloperRegistrar that made this project
     * @param _maxBlockWindow           The maximum amount of blocks a signature used for updating chip table is valid for
     */
    constructor(
        address _projectManager, 
        IChipRegistry _chipRegistry, 
        IERS _ers, 
        IDeveloperRegistrar _developerRegistrar,
        uint256 _maxBlockWindow
    ) 
        BaseProjectRegistrar(
            _projectManager,
            _chipRegistry,
            _ers,
            _developerRegistrar
        )
    {
        maxBlockWindow = _maxBlockWindow;
    }

    /* ============ External Functions ============ */
    /**
     * @notice Allow a chip holder to name chip to the ERS and enroll it to the Chip Registry. Chip owner will be
     * set as the msg.sender. Will revert if invalid proof of ownership is given or ownership proof is expired.
     * Will revert if chip is msg.sender since it cannot own itself.
     * 
     * @param _chipId                   Address of the chip being claimed
     * @param _nameHash                 Keccak256 hash of the human-readable name for the chip being claimed
     * @param _claimData                Struct containing chip info
     * @param _manufacturerValidation   Struct with needed info for chip's manufacturer validation
     * @param _commitBlock              The block the signature is tied to (used to put a time limit on the signature)
     * @param _chipOwnershipProof       Chip signature of the chainId, _commitBlock, _nameHash, and msg.sender packed together
     */
    function claimChip(
        address _chipId,
        bytes32 _nameHash,
        IChipRegistry.DeveloperMerkleInfo memory _claimData,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation,
        uint256 _commitBlock,
        bytes memory _chipOwnershipProof
    ) 
        external 
    {
        require(msg.sender != _chipId, "Chip cannot own itself");

        address chipOwner = msg.sender;

        _chipId.validateSignatureAndExpiration(
            _commitBlock,
            maxBlockWindow,
            abi.encodePacked(block.chainid, _commitBlock, _nameHash, chipOwner), 
            _chipOwnershipProof
        );

        // Call createSubnodeRecord from the ERS Registry to create a subnode with the chip as the resolver
        // and the caller as the owner.
        _createSubnodeAndClaimChip(
            _chipId,
            _nameHash,
            chipOwner,
            _claimData,
            _manufacturerValidation
        );
    }
}



