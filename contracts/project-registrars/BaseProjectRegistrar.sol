//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { ChipValidations } from "../lib/ChipValidations.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";

/**
 * @title BaseProjectRegistrar
 * @author Arx Research
 * 
 * @notice Base contract for ProjectRegistrars. Contains common functionality for all ProjectRegistrars including setting the root node
 * and claiming chips.
 */
contract BaseProjectRegistrar is Ownable, IProjectRegistrar {
    using ChipValidations for address;

    /* ============ Events ============ */
    // Emitted when a new root node has been set
    event RootNodeSet(bytes32 _rootNode);

    /* ============ Modifiers ============ */
    modifier onlyDeveloperRegistrar() {
        require(address(developerRegistrar) == msg.sender, "onlyDeveloperRegistrar: Only the contract's Developer Registrar can call this function");
        _;
    }

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry; 
    IERS public immutable ers; 
    IDeveloperRegistrar public immutable developerRegistrar; 
    
    bytes32 public rootNode;                    // It is the hash(hash(projectName), node(developer.ers))

    /* ============ Constructor ============ */
    /**
     // TODO: _projectManager seems to replace the function of projectPublicKey since there is no longer a merkle to update...
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
        Ownable() 
    {
        _transferOwnership(_projectManager);
        chipRegistry = _chipRegistry;
        ers = _ers;
        developerRegistrar = _developerRegistrar;
    }

    /* ============ External Admin Functions ============ */

    /**
     * @dev ONLY DEVELOPER REGISTRAR: Set the root node for this project (ie project.developer.ers)
     * 
     * @param _rootNode The root node for this project
     */
    function setRootNode(bytes32 _rootNode) onlyDeveloperRegistrar() external override {
        require(rootNode == bytes32(0), "Root node already set");
        rootNode = _rootNode;
        emit RootNodeSet(_rootNode);
    }

    /* ============ Internal Functions ============ */

    /**
     * @notice Allow a chip holder to name chip to the ERS and enroll it to the Chip Registry. Chip owner will be
     * set as the msg.sender. Will revert if invalid proof of ownership is given or ownership proof is expired.
     * Will revert if chip is msg.sender since it cannot own itself.
     * 
     * @param _chipId                   Address of the chip being claimed
     * @param _chipOwner                Intended owner of the chip being claimed
     * @param _manufacturerValidation   Struct with needed info for chip's manufacturer validation
     */
    function _createSubnodeAndAddChip(
        address _chipId,
        address _chipOwner,
        bytes32 _nameHash,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation
    ) 
        internal
        onlyOwner()
    {
        // Registrar calls the addChip function on the ChipRegistry
        chipRegistry.addChip(_chipId, _chipOwner, _nameHash, _manufacturerValidation);
    }
}



