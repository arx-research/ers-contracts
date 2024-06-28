//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { AddressArrayUtils } from "./lib/AddressArrayUtils.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IManufacturerRegistry } from "./interfaces/IManufacturerRegistry.sol";
import { IDeveloperRegistrar } from "./interfaces/IDeveloperRegistrar.sol";
import { IDeveloperRegistrarFactory } from "./interfaces/IDeveloperRegistrarFactory.sol";

/**
 * @title DeveloperRegistry
 * @author Arx
 *
 * @notice Contract responsible for tracking and permissioning Developers. Developers are given the ability to create a new DeveloperRegistrar by
 * governance. When creating a new Registrar the Developer is given a new [x].ers name. Governance has the ability to revoke Developer permissions
 * and reassign the ERS name to a new Developer.
 */
contract DeveloperRegistry is Ownable2Step {

    using AddressArrayUtils for address[];

    /* ============ Events ============ */
    event DeveloperRegistrarAdded(address indexed developerRegistrar, address indexed owner, bytes32 rootNode);
    event DeveloperRegistrarRevoked(address indexed developerRegistrar, bytes32 subnode, bytes32 _nameHash);
    event DeveloperAllowed(address indexed developerOwner, bytes32 nameHash);
    event DeveloperDisallowed(address indexed developerOwner);
    event RegistrarFactoryAdded(address indexed factory);
    event RegistrarFactoryRemoved(address indexed factory);
    event RegistryInitialized(address ers);

    /* ============ Modifiers ============ */
    modifier onlyNameGovernor() {
        require(msg.sender == nameGovernor, "Only the Name Governor can call this function");
        _;
    }
    
    /* ============ Constants ============ */
    // Equal to keccak256(abi.encodePacked(uint256(0), keccak256("ers")))
    bytes32 public constant ROOT_NODE = 0xda53397877d78746657194546b25f20b5c2e580045028a6fa27f07cf94e704ba;

    // TODO: do we add a CHAIN_NODE? Or simply concatenate as `chain-name.ers`?
    
    /* ============ State Variables ============ */
    IERS public ersRegistry;
    bool public initialized;
    address public nameGovernor;

    mapping(IDeveloperRegistrarFactory=>bool) public registrarFactories;  // Mapping indicating if address is a registered DeveloperRegistrarFactory
    mapping(address=>bytes32) public pendingDevelopers;                   // Mapping of Developer owner address to the nameHash they want for their 
                                                                          // DeveloperRegistrar
    mapping(address=>bool) public isDeveloperRegistrar;                   // Mapping indicating if address is a DeveloperRegistrar
    address[] internal developerRegistrars;

    /* ============ Constructor ============ */
    constructor(address _governance) Ownable2Step() {
        transferOwnership(_governance);
    }

    /* ============ External Functions ============ */

    /**
     * @notice ONLY OWNER: Initialize ChipRegistry contract with ERS and Services Registry addresses. Required due to order of operations
     * during deploy.
     *
     * @param _ers                       Address of the ERS contract
     * @param _factories                 Array of DeveloperRegistrarFactory contracts
     * @param _nameGovernor              Address of the Name Governor which can assign names to Developers
     */
    function initialize(
        IERS _ers,
        IDeveloperRegistrarFactory[] calldata _factories,
        address _nameGovernor
    )
        external
        onlyOwner
    {
        require(!initialized, "Contract already initialized");
        ersRegistry = _ers;
        nameGovernor = _nameGovernor;

        for (uint256 i = 0; i < _factories.length; ++i) {
            _addRegistrarFactory(_factories[i]);
        }

        initialized = true;
        emit RegistryInitialized(address(_ers));
    }

    /**
     * @notice Create a new DeveloperRegistrar for a Developer. In order to call, the calling address must be approved by governance. Once called
     * the Developer must be added again if they want to launch a new DeveloperRegistrar. This function assigns the DeveloperRegistrar it's own
     * .ers name. The passed nameHash must be different than any other DeveloperRegistrar's nameHash.
     *
     * @param _factory              Address of the DeveloperRegistrarFactory to use for deploying the DeveloperRegistrar
     */
    function createNewDeveloperRegistrar(IDeveloperRegistrarFactory _factory) external returns(address) {
        require(registrarFactories[_factory], "Factory must be approved DeveloperRegistrarFactory");
        require(pendingDevelopers[msg.sender] != bytes32(0), "Caller must be approved Developer address");

        // Save Developers nameHash in memory and then delete from storage
        bytes32 nameHash = pendingDevelopers[msg.sender];
        delete pendingDevelopers[msg.sender];

        // Passing the owner of the new Registrar to the Factory. Caller is set as owner. This can be transferred to a multisig later.
        address newRegistrar = IDeveloperRegistrarFactory(_factory).deployDeveloperRegistrar();
        bytes32 registrarRootNode = ersRegistry.createSubnodeRecord(ROOT_NODE, nameHash, newRegistrar, newRegistrar);

        // Registrar is a trusted contract that we initialize with a root node
        IDeveloperRegistrar(newRegistrar).initialize(msg.sender, registrarRootNode);

        isDeveloperRegistrar[newRegistrar] = true;
        developerRegistrars.push(newRegistrar);

        emit DeveloperRegistrarAdded(newRegistrar, msg.sender, registrarRootNode);
        return newRegistrar;
    }

    /**
     * @notice ONLY OWNER: Revoke permissions from a DeveloperRegistrar. This resets the owner and resolver to the zero address in the ERSRegistry
     * and removes tracking of the DeveloperRegistrar within the DeveloperRegistry (delete from developerRegistrars array and isDeveloperRegistrar
     * mapping). 
     *
     * @param _developerRegistrar   Address of the DeveloperRegistrar that is being revoked
     * @param _nameHash             Bytes32 hash of the ERS name the Developer wants for their Registrar
     */
    function revokeDeveloperRegistrar(address _developerRegistrar, bytes32 _nameHash) external onlyOwner {
        require(isDeveloperRegistrar[_developerRegistrar], "Not a DeveloperRegistrar");

        // Validate that _nameHash is the nameHash of the DeveloperRegistrar. We can do this check because we know the DeveloperRegistrar's root node
        // cannot be updated since it a trusted contract.
        bytes32 subnodeHash = ersRegistry.getSubnodeHash(ROOT_NODE, _nameHash);
        bytes32 registrarRootNode = IDeveloperRegistrar(_developerRegistrar).rootNode();
        require(subnodeHash == registrarRootNode, "Passed subnode does not match Registrar's root node");

        ersRegistry.deleteSubnodeRecord(ROOT_NODE, _nameHash);

        delete isDeveloperRegistrar[_developerRegistrar];
        developerRegistrars.removeStorage(_developerRegistrar);
        
        emit DeveloperRegistrarRevoked(_developerRegistrar, subnodeHash, _nameHash);
    }

    /**
     * @notice ONLY OWNER: Add a new address that can create a new DeveloperRegistrar. Since ERS names have value we want them to commit to a name
     * up front. The passed nameHash must be different than any other DeveloperRegistrar's nameHash and not bytes32(0).
     *
     * @param _developerOwner       Address that has the ability to create a new DeveloperRegistrar with the below nameHash
     * @param _nameHash             Bytes32 hash of the ERS name the Developer wants for their Registrar
     */
    function addAllowedDeveloper(address _developerOwner, bytes32 _nameHash) external onlyNameGovernor {
        require(pendingDevelopers[_developerOwner] == bytes32(0), "Developer already allowed");
        // can't allow zero bytes since it's the default value for pendingDevelopers. Will not allow someone to deploy a Registrar with zero
        // bytes name.
        require(_nameHash != bytes32(0), "Invalid name hash");
        require(_developerOwner != address(0), "Invalid Developer owner address");
        require(ersRegistry.getSubnodeOwner(ROOT_NODE, _nameHash) == address(0), "Name already taken");

        pendingDevelopers[_developerOwner] = _nameHash;
        emit DeveloperAllowed(_developerOwner, _nameHash);
    }

    /**
     * @notice ONLY OWNER: Remove an address from creating a new DeveloperRegistrar. 
     *
     * @param _developerOwner       Address that has the ability to create a new DeveloperRegistrar with the below nameHash
     */
    function removeAllowedDeveloper(address _developerOwner) external onlyNameGovernor {
        require(pendingDevelopers[_developerOwner]!= bytes32(0), "Developer not allowed");

        delete pendingDevelopers[_developerOwner];
        emit DeveloperDisallowed(_developerOwner);
    }

    /**
     * @notice ONLY OWNER: Add a new DeveloperRegistrarFactory that can be used for creating new DeveloperRegistrars; examples
     * might include registrars with interspersed nodes (e.g. project.group.developer.ers) 
     *
     * @param _factory             Address of DeveloperRegistrarFactory to add
     */
    function addRegistrarFactory(IDeveloperRegistrarFactory _factory) external onlyOwner {
        _addRegistrarFactory(_factory);
    }

    /**
     * @notice ONLY OWNER: Remove a DeveloperRegistrarFactory so that it can't be used for creating new DeveloperRegistrars.
     *
     * @param _factory             Address of DeveloperRegistrarFactory to add
     */
    function removeRegistrarFactory(IDeveloperRegistrarFactory _factory) external onlyOwner {
        require(registrarFactories[_factory], "Factory not added");

        delete registrarFactories[_factory];
        emit RegistrarFactoryRemoved(address(_factory));
    }

    /* ============ View Functions ============ */
    
    function getDeveloperRegistrars() external view returns(address[] memory) {
        return developerRegistrars;
    }

    /* ============ Internal Functions ============ */

    function _addRegistrarFactory(IDeveloperRegistrarFactory _factory) internal {
        require(!registrarFactories[_factory], "Factory already added");
        require(address(_factory) != address(0), "Invalid factory address");

        registrarFactories[_factory] = true;
        emit RegistrarFactoryAdded(address(_factory));
    }
}
