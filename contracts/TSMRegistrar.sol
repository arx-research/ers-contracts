//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";
import { ITransferPolicy } from "./interfaces/ITransferPolicy.sol";
import { ITSMRegistry } from "./interfaces/ITSMRegistry.sol";

/**
 * @title TSMRegistrar
 * @author Arx
 *
 * @notice Contract that coordinates adding a new project for a TSM. Each TSM has their own TSMRegistrar which is associated
 * with a .ers subnode in the ERS registry ([tsm].ers). When adding a new project a subnode under the tsm.ers sub-
 * domain is added ([projectName].tsm.ers) and the project is enrolled in the ChipRegistry.
 */
contract TSMRegistrar is Ownable {

    /* ============ Events ============ */
    event ProjectAdded(
        address indexed projectRegistrar,
        bytes32 projectRootNode,
        bytes32 merkleRoot,
        address projectPublicKey,
        address transferPolicy,
        string projectClaimDataUri
    );
    event RegistrarInitialized(bytes32 rootNode);

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry;
    IERS public immutable ers;
    ITSMRegistry public immutable tsmRegistry;

    bool public initialized;
    bytes32 public rootNode;            // Node off which all TSM project names will branch (ie [projectName].[tsmName].ers)
    address[] public projects;

    /* ============ Constructor ============ */

    /**
     * @notice Constructor for TSMRegistrar. Sets the owner and ChipRegistry.
     *
     * @param _owner                        Owner of the TSMRegistrar. This address is responsible for adding new projects
     * @param _chipRegistry                 ChipRegistry contract
     * @param _ers                          ERS registry
     * @param _tsmRegistry                  TSMRegistry contract
     */
    constructor(
        address _owner,
        IChipRegistry _chipRegistry,
        IERS _ers,
        ITSMRegistry _tsmRegistry
    )
        Ownable()
    {
        chipRegistry = _chipRegistry;
        ers = _ers;
        tsmRegistry = _tsmRegistry;
        transferOwnership(_owner);
    }

    /* ============ External Functions ============ */

    /**
     * @notice ONLY TSM REGISTRY: Initialize TSMRegistrar contract with root node. Required due to order of operations
     * during deploy.
     *
     * @param _rootNode                       Root node of the TSM
     */
    function initialize(bytes32 _rootNode) external {
        require(ITSMRegistry(msg.sender) == tsmRegistry, "Caller must be TSMRegistry");
        require(!initialized, "Contract already initialized");
        
        rootNode = _rootNode;
        initialized = true;
        emit RegistrarInitialized(_rootNode);
    }

    /**
     * @notice ONLY OWNER: Add a new project to the TSM. Creates a new subnode in the ENS registry and adds the project
     * to the ChipRegistry. TSMRegistrar's DO NOT have the ability to overwrite their subnodes in ERS, hence if a _nameHash
     * is already taken, this function will revert. Ownership proof is checked in the ChipRegistry.
     *
     * @param _nameHash                     Namehash of the project
     * @param _projectRegistrar             ProjectRegistrar contract
     * @param _merkleRoot                   Merkle root of the project's chip ownership
     * @param _projectPublicKey             Public key of the project
     * @param _transferPolicy               Transfer policy of the project
     * @param _ownershipProof               Signed hash of the _projectRegistrar address by the _projectPublicKey
     * @param _projectClaimDataUri          URI pointing to location of off-chain data required to claim chips
     */
    function addProject(
        bytes32 _nameHash,
        IProjectRegistrar _projectRegistrar,
        bytes32 _merkleRoot,
        address _projectPublicKey,
        ITransferPolicy _transferPolicy,
        bytes calldata _ownershipProof,
        string calldata _projectClaimDataUri
    )
        external
        onlyOwner()
    {
        require(_merkleRoot != bytes32(0), "Invalid merkle root");
        require(_projectPublicKey != address(0), "Invalid project public key");
        require(address(_projectRegistrar) != address(0), "Invalid project registrar address");

        // Create subnode in ENS registry; if _nameHash has already been used it will revert here
        bytes32 projectNode = ers.createSubnodeRecord(
            rootNode,
            _nameHash,
            address(_projectRegistrar),
            address(_projectRegistrar)
        );

        // Call project registrar to set root node (this is an untrusted contract!)
        _projectRegistrar.setRootNode(projectNode);
        projects.push(address(_projectRegistrar));

        chipRegistry.addProjectEnrollment(
            _projectRegistrar,
            _projectPublicKey,
            _transferPolicy,
            _merkleRoot,
            _ownershipProof,
            _projectClaimDataUri
        );

        emit ProjectAdded(
            address(_projectRegistrar),
            projectNode,
            _merkleRoot,
            _projectPublicKey,
            address(_transferPolicy),
            _projectClaimDataUri
        );
    }

    /* ============ View Functions ============ */

    function getProjects() external view returns(address[] memory) {
        return projects;
    }
}
