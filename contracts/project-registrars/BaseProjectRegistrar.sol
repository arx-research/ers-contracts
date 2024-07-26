//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ChipValidations } from "../lib/ChipValidations.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";
import { IERC165, ERC165 } from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title BaseProjectRegistrar
 * @author Arx Research
 * 
 * @notice Base contract for ProjectRegistrars. Contains common functionality for all ProjectRegistrars including setting the root node
 * and claiming chips.
 */
contract BaseProjectRegistrar is Ownable2Step, ERC165, IProjectRegistrar {
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
     * @param _chipRegistry             The chip registry of the ERS system being used
     * @param _ers                      The ERS registry of the ERS system being used
     * @param _developerRegistrar       The DeveloperRegistrar that made this project
     */
    constructor(
        IChipRegistry _chipRegistry, 
        IERS _ers, 
        IDeveloperRegistrar _developerRegistrar
    ) 
        Ownable2Step() 
    {
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

    /* ============ External Functions ============ */

    /**
     * @notice Lookup a chip owner via ERS; adding on ProjectRegistrar enforces that collections
     * must (1) allow ownership lookups and (2) increase the probability ownership truth is 
     * contained in ERS.
     * 
     * @param _chipId                   Address of the chip being claimed
     */
    function ownerOf(address _chipId) 
        external 
        view 
        returns (address) 
    {
        bytes32 chipNode = chipRegistry.node(_chipId);
        return ers.getOwner(chipNode);
    }

    function supportsInterface(bytes4 _interfaceId)
        public
        view
        virtual
        override(ERC165)
        returns (bool)
    {
        return _interfaceId == type(IProjectRegistrar).interfaceId ||
        super.supportsInterface(_interfaceId);
    }

    /* ============ Internal Functions ============ */

    /**
     * @notice Allow a chip holder to name chip to the ERS and enroll it to the Chip Registry
     * 
     * @param _chipId                   Address of the chip being claimed
     * @param _chipOwner                Intended owner of the chip being claimed
     * @param _manufacturerValidation   Struct with needed info for chip's manufacturer validation
     * @param _custodyProof             Proof of custody for the chip
     */
    function _addChip(
        address _chipId,
        address _chipOwner,
        bytes32 _nameHash,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation,
        bytes memory _custodyProof
    ) 
        internal
    {
        // Registrar calls the addChip function on the ChipRegistry
        chipRegistry.addChip(
            _chipId, 
            _chipOwner, 
            _nameHash,
            _manufacturerValidation, 
            _custodyProof
        );
    }
}
