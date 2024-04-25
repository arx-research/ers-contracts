//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";

/**
 * @title DeveloperRegistrar
 * @author Arx
 *
 * @notice Contract that coordinates adding a new project for a Developer. Each Developer has their own DeveloperRegistrar which is associated
 * with a .ers subnode in the ERS registry ([developer].ers). When adding a new project a subnode under the developer.ers sub-
 * domain is added ([projectName].developer.ers) and the project is enrolled in the ChipRegistry.
 */
contract DeveloperRegistrar is Ownable {

    event ProjectAdded(
        address indexed projectRegistrar,
        bytes32 projectRootNode
    );
    event RegistrarInitialized(bytes32 rootNode);

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry;
    IERS public immutable ers;
    IDeveloperRegistry public immutable developerRegistry;

    bool public initialized;
    bytes32 public rootNode;            // Node off which all Developer project names will branch (ie [projectName].[developerName].ers)
    address[] public projects;

    /* ============ Constructor ============ */

    /**
     * @notice Constructor for DeveloperRegistrar. Sets the owner and ChipRegistry.
     *
     * @param _owner                Owner of the DeveloperRegistrar. This address is responsible for adding new projects
     * @param _chipRegistry         ChipRegistry contract
     * @param _ers                  ERS registry
     * @param _developerRegistry    DeveloperRegistry contract
     */
    constructor(
        address _owner,
        IChipRegistry _chipRegistry,
        IERS _ers,
        IDeveloperRegistry _developerRegistry
    )
        Ownable()
    {
        chipRegistry = _chipRegistry;
        ers = _ers;
        developerRegistry = _developerRegistry;
        transferOwnership(_owner);
    }

    /* ============ External Functions ============ */

    /**
     * @notice ONLY Developer REGISTRY: Initialize DeveloperRegistrar contract with root node. Required due to order of operations
     * during deploy.
     *
     * @param _rootNode         Root node of the Developer
     */
    function initialize(bytes32 _rootNode) external {
        require(IDeveloperRegistry(msg.sender) == developerRegistry, "Caller must be DeveloperRegistry");
        require(!initialized, "Contract already initialized");
        
        rootNode = _rootNode;
        initialized = true;
        emit RegistrarInitialized(_rootNode);
    }

    /**
     * @notice ONLY OWNER: Add a new project to the Developer. Creates a new subnode in the ENS registry and adds the project
     * to the ChipRegistry. DeveloperRegistrar's DO NOT have the ability to overwrite their subnodes in ERS, hence if a _nameHash
     * is already taken, this function will revert. Ownership proof is checked in the ChipRegistry.
     *
     * @param _nameHash                     Namehash of the project
     * @param _projectRegistrar             ProjectRegistrar contract
     * @param _serviceId                    Service ID of the project
     * @param _lockinPeriod                 Lockup period of the project
     */

    function addProject(
        IProjectRegistrar _projectRegistrar,
        bytes32 _nameHash,
        bytes32 _serviceId,
        uint256 _lockinPeriod
    )
        external
        onlyOwner()
    {
        // Verify the project registrar is not the zero address
        // TODO: check interface signatures to ensure it matches IPBT and IProjectRegistrar
        require(address(_projectRegistrar) != address(0), "Invalid project registrar address");

        // Call project registrar to set root node (this is an untrusted contract!)
        bytes32 projectNode = keccak256(abi.encodePacked(rootNode, _nameHash));

        chipRegistry.addProjectEnrollment(
            _projectRegistrar,
            _nameHash,
            _serviceId,
            _lockinPeriod
        );

        _projectRegistrar.setRootNode(projectNode);
        projects.push(address(_projectRegistrar));

        emit ProjectAdded(
            address(_projectRegistrar),
            projectNode
        );
    }

    /* ============ View Functions ============ */

    function getProjects() external view returns(address[] memory) {
        return projects;
    }
}
