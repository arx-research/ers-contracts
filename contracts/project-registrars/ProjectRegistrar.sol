//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { ChipValidations } from "../lib/ChipValidations.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { ITSMRegistrar } from "../interfaces/ITSMRegistrar.sol";

/**
 * @title ProjectRegistrar
 * @author Arx Research
 * 
 * @notice Entry point for users claiming chips. Responsible for setting the ers name for each chip in its enrollment as [chip].project.tsm.ers.
 * The TSM Registrar sets the root node of the ProjectRegistrar when addProject is called on the TSMRegistrar
 * The owner of the contract can set the claim app URL
 */
contract ProjectRegistrar is Ownable, IProjectRegistrar {
    using ChipValidations for address;

    /* ============ Events ============ */
    // Emitted when a new root node has been set
    event RootNodeSet(bytes32 _rootNode);

    /* ============ Modifiers ============ */
    modifier onlyTSMRegistrar() {
        require(address(tsmRegistrar) == msg.sender, "onlyTSMRegistrar: Only the contract's TSM Registrar can call this function");
        _;
    }

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry; 
    IERS public immutable ers; 
    ITSMRegistrar public immutable tsmRegistrar; 
    uint256 public immutable maxBlockWindow;
    
    bytes32 public rootNode;                    // It is the hash(hash(projectName), node(tsm.ers))

    /* ============ Constructor ============ */
    /**
     * @param _projectManager           The address that will be set as the owner
     * @param _chipRegistry             The chip registry of the ERS system being used
     * @param _ers                      The ERS registry of the ERS system being used
     * @param _tsmRegistrar             The TSMRegistrar that made this project
     * @param _maxBlockWindow           The maximum amount of blocks a signature used for updating chip table is valid for
     */
    constructor(
        address _projectManager, 
        IChipRegistry _chipRegistry, 
        IERS _ers, 
        ITSMRegistrar _tsmRegistrar,
        uint256 _maxBlockWindow
    ) 
        Ownable() 
    {
        _transferOwnership(_projectManager);
        chipRegistry = _chipRegistry;
        ers = _ers;
        tsmRegistrar = _tsmRegistrar;
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
     * @param _ownershipProof           Chip signature of the chainId, _commitBlock, _nameHash, and msg.sender packed together
     * @param _tsmCertificate           Chip's public key/ID signed by the projectPublicKey
     * @param _custodyProof             Proof that the chip was in custody of the TSM, the projectPublicKey signed by the chip
     */
    function claimChip(
        address _chipId,
        bytes32 _nameHash,
        IChipRegistry.TSMMerkleInfo memory _claimData,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation,
        uint256 _commitBlock,
        bytes memory _ownershipProof,
        bytes memory _tsmCertificate,
        bytes memory _custodyProof
    ) 
        external 
    {
        require(msg.sender != _chipId, "Chip cannot own itself");

        address chipOwner = msg.sender;

        _chipId.validateSignatureAndExpiration(
            _commitBlock,
            maxBlockWindow,
            abi.encodePacked(block.chainid, _commitBlock, _nameHash, chipOwner), 
            _ownershipProof
        );

        // Call createSubnodeRecord from the ERS Registry to create a subnode with the chip as the resolver
        // and the caller as the owner.
        bytes32 ersNode = ers.createSubnodeRecord(rootNode, _nameHash, chipOwner, _chipId);

        IChipRegistry.ChipClaim memory chipClaim = IChipRegistry.ChipClaim({
            owner: chipOwner,
            ersNode: ersNode,
            tsmMerkleInfo: _claimData
        });

        // Registrar calls the claimChip function on the ChipRegistry
        chipRegistry.claimChip(_chipId, chipClaim, _manufacturerValidation, _tsmCertificate, _custodyProof);
    }

    /**
     * @dev ONLY TSM REGISTRAR: Set the root node for this project (ie project.tsm.ers)
     * 
     * @param _rootNode The root node for this project
     */
    function setRootNode(bytes32 _rootNode) onlyTSMRegistrar() external override {
        rootNode = _rootNode;
        emit RootNodeSet(_rootNode);
    }
}



