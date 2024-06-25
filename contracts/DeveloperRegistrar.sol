//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";
import { IServicesRegistry } from "./interfaces/IServicesRegistry.sol";

/**
 * @title DeveloperRegistrar
 * @author Arx
 *
 * @notice Contract that coordinates adding a new project for a Developer. Each Developer has their own DeveloperRegistrar which is associated
 * with a .ers subnode in the ERS registry ([developer].ers). When adding a new project a subnode under the developer.ers sub-
 * domain is added ([projectName].developer.ers) and the project is enrolled in the ChipRegistry.
 */
contract DeveloperRegistrar is Ownable2Step {

    event ProjectAdded(
        address indexed projectRegistrar,
        bytes32 projectRootNode
    );
        event ProjectRemoved(
        address indexed projectRegistrar
    );
    event RegistrarInitialized(bytes32 rootNode);

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry;
    IERS public immutable ers;
    IDeveloperRegistry public immutable developerRegistry;
    IServicesRegistry public immutable servicesRegistry;

    bool public initialized;
    bytes32 public rootNode;                          // Node off which all Developer project names will branch (ie [projectName].[developerName].ers)
    address[] public projects;                        // Array of project addresses for enumeration
    mapping(address => uint256) private projectIndex; // Maps project addresses to their indices in the array

    /* ============ Constructor ============ */

    /**
     * @notice Constructor for DeveloperRegistrar. Sets the owner and ChipRegistry.
     *
     * @param _owner                Owner of the DeveloperRegistrar. This address is responsible for adding new projects
     * @param _chipRegistry         ChipRegistry contract
     * @param _ers                  ERS registry
     * @param _developerRegistry    DeveloperRegistry contract
     * @param _servicesRegistry     ServicesRegistry contract used by all Projects deployed by this Registrar
     */
    constructor(
        address _owner,
        IChipRegistry _chipRegistry,
        IERS _ers,
        IDeveloperRegistry _developerRegistry,
        IServicesRegistry _servicesRegistry
    )
        Ownable2Step()
    {
        chipRegistry = _chipRegistry;
        ers = _ers;
        developerRegistry = _developerRegistry;
        servicesRegistry = _servicesRegistry;
        _transferOwnership(_owner);
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
     * @param _lockinPeriod                 Lockin period of the project
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
        require(address(_projectRegistrar) != address(0), "Invalid project registrar address");
        require(projectIndex[address(_projectRegistrar)] == 0, "Project already added");

        bytes32 projectNode = ers.createSubnodeRecord(
            rootNode,
            _nameHash,
            address(_projectRegistrar),
            address(_projectRegistrar)
        );

        _projectRegistrar.setRootNode(projectNode);

        projects.push(address(_projectRegistrar));
        projectIndex[address(_projectRegistrar)] = projects.length - 1;

        chipRegistry.addProjectEnrollment(
            _projectRegistrar,
            _nameHash,
            servicesRegistry,
            _serviceId,
            _lockinPeriod
        );

        emit ProjectAdded(
            address(_projectRegistrar), 
            projectNode
        );
    }

    /**
     * @notice ONLY OWNER: Remove a project from the Developer. Removes the project from the ChipRegistry.
     * Only works if no chips have been added.
     *
     * @param _projectRegistrar     ProjectRegistrar contract
     */

    function removeProject(IProjectRegistrar _projectRegistrar) external onlyOwner() {
        require(address(_projectRegistrar) != address(0), "Invalid project registrar address");

        uint index = projectIndex[address(_projectRegistrar)];
        require(index != 0 || projects[0] == address(_projectRegistrar), "Project not enrolled");

        uint lastIndex = projects.length - 1;
        address lastProject = projects[lastIndex];

        projects[index] = lastProject;
        projectIndex[lastProject] = index;

        projects.pop();
        delete projectIndex[address(_projectRegistrar)];

        chipRegistry.removeProjectEnrollment(_projectRegistrar);

        emit ProjectRemoved(address(_projectRegistrar));
    }

    /* ============ View Functions ============ */

    function getProjects() external view returns(address[] memory) {
        return projects;
    }

}
