//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { AddressArrayUtils } from "./lib/AddressArrayUtils.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IManufacturerRegistry } from "./interfaces/IManufacturerRegistry.sol";
import { ITSMRegistrar } from "./interfaces/ITSMRegistrar.sol";
import { ITSMRegistrarFactory } from "./interfaces/ITSMRegistrarFactory.sol";

/**
 * @title TSMRegistry
 * @author Arx
 *
 * @notice Contract responsible for tracking and permissioning TSMs. TSMs are given the ability to create a new TSMRegistrar by governance.
 * When creating a new Registrar the TSM is given a new [x].ers name. Governance has the ability to revoke TSM permissions and re-
 * assign the ERS name to a new TSM.
 */
contract TSMRegistry is Ownable {

    using AddressArrayUtils for address[];

    /* ============ Events ============ */
    event TSMRegistrarAdded(address indexed tsmRegistrar, address indexed owner, bytes32 rootNode);
    event TSMRegistrarRevoked(address indexed tsmRegistrar, bytes32 subnode, bytes32 _nameHash);
    event TSMAllowed(address indexed tsmOwner, bytes32 nameHash);
    event TSMDisallowed(address indexed tsmOwner);
    event RegistrarFactoryAdded(address indexed factory);
    event RegistrarFactoryRemoved(address indexed factory);
    event RegistryInitialized(address ers);

    /* ============ Constants ============ */
    // Equal to keccak256(abi.encodePacked(uint256(0), keccak256("ers")))
    bytes32 public constant ROOT_NODE = 0xda53397877d78746657194546b25f20b5c2e580045028a6fa27f07cf94e704ba;
    
    /* ============ State Variables ============ */
    IERS public ersRegistry;
    bool public initialized;

    mapping(ITSMRegistrarFactory=>bool) public registrarFactories;  // Mapping indicating if address is a registered TSMRegistrarFactory
    mapping(address=>bytes32) public pendingTSMs;                   // Mapping of TSM owner address to the nameHash they want for their TSMRegistrar
    mapping(address=>bool) public isTSMRegistrar;                   // Mapping indicating if address is a TSMRegistrar
    address[] internal tsmRegistrars;

    /* ============ Constructor ============ */
    constructor(address _governance) Ownable() {
        transferOwnership(_governance);
    }

    /* ============ External Functions ============ */

    /**
     * @notice ONLY OWNER: Initialize ChipRegistry contract with ERS and Services Registry addresses. Required due to order of operations
     * during deploy.
     *
     * @param _ers                       Address of the ERS contract
     * @param _factories                 Array of TSMRegistrarFactory contracts
     */
    function initialize(IERS _ers, ITSMRegistrarFactory[] calldata _factories) external onlyOwner {
        require(!initialized, "Contract already initialized");
        ersRegistry = _ers;

        for (uint256 i = 0; i < _factories.length; ++i) {
            _addRegistrarFactory(_factories[i]);
        }

        initialized = true;
        emit RegistryInitialized(address(_ers));
    }

    /**
     * @notice Create a new TSMRegistrar for a TSM. In order to call, the calling address must be approved by governance. Once called the TSM
     * must be added again if they want to launch a new TSMRegistrar. This function assigns the TSMRegistrar it's own .ers name. The passed
     * nameHash must be different than any other TSMRegistrar's nameHash.
     *
     * @param _factory              Address of the TSMRegistrarFactory to use for deploying the TSMRegistrar
     */
    function createNewTSMRegistrar(ITSMRegistrarFactory _factory) external returns(address) {
        require(registrarFactories[_factory], "Factory must be approved TSMRegistrarFactory");
        require(pendingTSMs[msg.sender] != bytes32(0), "Caller must be approved TSM address");

        // Save TSMs nameHash in memory and then delete from storage
        bytes32 nameHash = pendingTSMs[msg.sender];
        delete pendingTSMs[msg.sender];

        // Passing the owner of the new Registrar to the Factory. Caller is set as owner. This can be transferred to a multisig later.
        address newRegistrar = ITSMRegistrarFactory(_factory).deployRegistrar(msg.sender);
        bytes32 registrarRootNode = ersRegistry.createSubnodeRecord(ROOT_NODE, nameHash, newRegistrar, newRegistrar);

        // Registrar is a trusted contract that we initialize with a root node
        ITSMRegistrar(newRegistrar).initialize(registrarRootNode);

        isTSMRegistrar[newRegistrar] = true;
        tsmRegistrars.push(newRegistrar);

        emit TSMRegistrarAdded(newRegistrar, msg.sender, registrarRootNode);
        return newRegistrar;
    }

    /**
     * @notice ONLY OWNER: Revoke permissions from a TSMRegistrar. This resets the owner and resolver to the zero address in the ERSRegistry
     * and removes tracking of the TSMRegistrar within the TSMRegistry (delete from tsmRegistrars array and isTSMRegistrar mapping). 
     *
     * @param _tsmRegistrar         Address of the TSMRegistrar that is being revoked
     * @param _nameHash             Bytes32 hash of the ERS name the TSM wants for their Registrar
     */
    function revokeTSMRegistrar(address _tsmRegistrar, bytes32 _nameHash) external onlyOwner {
        require(isTSMRegistrar[_tsmRegistrar], "Not a TSMRegistrar");

        // Validate that _nameHash is the nameHash of the TSMRegistrar. We can do this check because we know the TSMRegistrar's root node
        // cannot be updated since it a trusted contract.
        bytes32 subnodeHash = ersRegistry.getSubnodeHash(ROOT_NODE, _nameHash);
        bytes32 registrarRootNode = ITSMRegistrar(_tsmRegistrar).rootNode();
        require(subnodeHash == registrarRootNode, "Passed subnode does not match Registrar's root node");

        ersRegistry.deleteSubnodeRecord(ROOT_NODE, _nameHash);

        delete isTSMRegistrar[_tsmRegistrar];
        tsmRegistrars.removeStorage(_tsmRegistrar);
        
        emit TSMRegistrarRevoked(_tsmRegistrar, subnodeHash, _nameHash);
    }

    /**
     * @notice ONLY OWNER: Add a new address that can create a new TSMRegistrar. Since ERS names have value we want them to commit to a name
     * up front. The passed nameHash must be different than any other TSMRegistrar's nameHash and not bytes32(0).
     *
     * @param _tsmOwner             Address that has the ability to create a new TSMRegistrar with the below nameHash
     * @param _nameHash             Bytes32 hash of the ERS name the TSM wants for their Registrar
     */
    function addAllowedTSM(address _tsmOwner, bytes32 _nameHash) external onlyOwner {
        require(pendingTSMs[_tsmOwner] == bytes32(0), "TSM already allowed");
        // can't allow zero bytes since it's the default value for pendingTSMs. Will not allow someone to deploy a Registrar with zero bytes name.
        require(_nameHash != bytes32(0), "Invalid name hash");
        require(_tsmOwner != address(0), "Invalid TSM owner address");
        require(ersRegistry.getSubnodeOwner(ROOT_NODE, _nameHash) == address(0), "Name already taken");

        pendingTSMs[_tsmOwner] = _nameHash;
        emit TSMAllowed(_tsmOwner, _nameHash);
    }

    /**
     * @notice ONLY OWNER: Remove an address from creating a new TSMRegistrar. 
     *
     * @param _tsmOwner             Address that has the ability to create a new TSMRegistrar with the below nameHash
     */
    function removeAllowedTSM(address _tsmOwner) external onlyOwner {
        require(pendingTSMs[_tsmOwner]!= bytes32(0), "TSM not allowed");

        delete pendingTSMs[_tsmOwner];
        emit TSMDisallowed(_tsmOwner);
    }

    /**
     * @notice ONLY OWNER: Add a new TSMRegistrarFactory that can be used for creating new TSMRegistrars. 
     *
     * @param _factory             Address of TSMRegistrarFactory to add
     */
    function addRegistrarFactory(ITSMRegistrarFactory _factory) external onlyOwner {
        _addRegistrarFactory(_factory);
    }

    /**
     * @notice ONLY OWNER: Remove a TSMRegistrarFactory so that it can't be used for creating new TSMRegistrars.
     *
     * @param _factory             Address of TSMRegistrarFactory to add
     */
    function removeRegistrarFactory(ITSMRegistrarFactory _factory) external onlyOwner {
        require(registrarFactories[_factory], "Factory not added");

        delete registrarFactories[_factory];
        emit RegistrarFactoryRemoved(address(_factory));
    }

    /* ============ View Functions ============ */
    
    function getTSMRegistrars() external view returns(address[] memory) {
        return tsmRegistrars;
    }

    /* ============ Internal Functions ============ */

    function _addRegistrarFactory(ITSMRegistrarFactory _factory) internal {
        require(!registrarFactories[_factory], "Factory already added");
        require(address(_factory) != address(0), "Invalid factory address");

        registrarFactories[_factory] = true;
        emit RegistrarFactoryAdded(address(_factory));
    }
}
