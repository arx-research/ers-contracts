//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IManufacturerRegistry } from "./interfaces/IManufacturerRegistry.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";
import { ITransferPolicy } from "./interfaces/ITransferPolicy.sol";
import { IDeveloperRegistrar } from "./interfaces/IDeveloperRegistrar.sol";
import { BaseProjectRegistrar } from "./project-registrars/BaseProjectRegistrar.sol";

/**
 * @title ArxProjectEnrollmentManager
 * @author Arx
 * 
 * @notice Smart contract that handles deployment of new Project Registrar contracts for new Developer projects.
 * This should be set as the owner of the Developer Registrar contract before adding any new projects.
 */
contract ArxProjectEnrollmentManager is Ownable {
    
    using ECDSA for bytes;
    using SignatureChecker for address;

    /* ============ Events ============ */
    event ProjectRegistrarDeployed(address indexed projectRegistrar, address indexed owner);
    event NewTransferPolicySet(ITransferPolicy indexed transferPolicy);
    event NewMaxBlockWindowSet(uint256 maxBlockWindow);

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry;
    IDeveloperRegistrar public immutable developerRegistrar;
    IERS public immutable ers;
    IManufacturerRegistry public immutable manufacturerRegistry;
    ITransferPolicy public transferPolicy;
    uint256 public maxBlockWindow;
    
    /* ============ Constructor ============ */
    /**
     * @param _chipRegistry             The Chip Registry contract of the ERS system
     * @param _developerRegistrar       The Developer Registrar contract of the ERS system
     * @param _ers                      The ERS Registry contract of the ERS system
     * @param _manufacturerRegistry     The Manufacturer Registry contract of the ERS system
     * @param _transferPolicy           The transfer policy contract for the project being deployed
     * @param _maxBlockWindow           The maximum amount of blocks a signature used for updating chip table is valid for
     *                                  passed to all ProjectRegistrar contracts deployed by this contract
     */
    constructor(
        IChipRegistry _chipRegistry, 
        IDeveloperRegistrar _developerRegistrar, 
        IERS _ers,
        IManufacturerRegistry _manufacturerRegistry,
        ITransferPolicy _transferPolicy,
        uint256 _maxBlockWindow
    )
        Ownable()
    {
        transferPolicy = _transferPolicy;
        chipRegistry = _chipRegistry;
        developerRegistrar = _developerRegistrar;
        manufacturerRegistry = _manufacturerRegistry;
        ers = _ers;
        maxBlockWindow = _maxBlockWindow;
    }

    /* ============ External Functions ============ */

    /**
      * @notice Adds a new Developer's project to the ERS system by deploying the ProjectRegistrar contract via CREATE2 and
      * registering it to the Developer Registrar. We use CREATE2 because we need the projectManager to provide proof of
      * ownership by signing a hash of the projectRegistrar address with the projectPublicKey. This is not possible
      * unless we know the address ahead of time, hence we use CREATE2 which allows us to know the address.
      * 
      * @param _projectManager          The address that will be set as the owner of the project registrar contract
      * @param _nameHash                Keccak256 hash of the human-readable name for the chip being claimed
      * @param _projectPublicKey        Public key used in the generation of the Developer certificates
      * @param _provingChip             The chip used as proof of ownership
      * @param _manufacturerValidation  Manufacturer Validation info for the proving chip
      * @param _projectOwnershipProof   Proof of ownership of the project
      */

    // TODO: require that the project add an initial chip? Add function to add chips.
    function addProject(
        address _projectManager,
        bytes32 _nameHash,
        address _projectPublicKey,
        bytes32 _serviceId,
        uint256 _lockinPeriod,
        address _provingChip,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation,
        bytes memory _projectOwnershipProof
    )
        public 
    {
        require(_isNotZeroAddress(_projectManager), "Invalid project manager address");
        require(_isNotZeroAddress(_projectPublicKey), "Invalid project public key address");

        _validateManufacturerCertificate(
            _provingChip,
            _manufacturerValidation
        );

        _deployProjectRegistrarAndAddProject(
            _projectManager,
            _nameHash,
            _projectPublicKey,
            _serviceId,
            _lockinPeriod,
            _projectOwnershipProof
        );
    }

    /**
     * @notice Sets the transfer policy for all projects deployed by this contract
     * 
     * @param _transferPolicy   The new transfer policy contract
     */
    function setTransferPolicy(ITransferPolicy _transferPolicy) external onlyOwner {
        transferPolicy = _transferPolicy;
        emit NewTransferPolicySet(_transferPolicy);
    }

    /**
     * @notice Sets the max block window for all projects deployed by this contract. Max block window used to
     * validate ownership signatures for chip claims made through ProjectRegistrar.
     * 
     * @param _maxBlockWindow   The new max block window
     */
    function setMaxBlockWindow(uint256 _maxBlockWindow) external onlyOwner {
        maxBlockWindow = _maxBlockWindow;
        emit NewMaxBlockWindowSet(_maxBlockWindow);
    }
    
    /* ============ Internal Functions ============ */
    /**
     * @dev Returns true if passed address is not the zero address
     * 
     * @param _address The address to check
     */
    function _isNotZeroAddress(address _address) internal pure returns(bool){
        return _address != address(0);
    }

    /**
     * @dev Validates that the chip used as proof of ownership is in possesion of the msg.sender, is included in the project merkle root, AND
     * is a chip that's been enrolled in the ManufacturerRegistry.
     *
     * @param _provingChip                  The chip used as proof of ownership
     * @param _manufacturerValidation       Manufacturer Validation info for the proving chip
     */

    // TODO: I am debating whether we need a chipOwnershipProof; I don't believe it adds anything and have ommited
    function _validateManufacturerCertificate(
        address _provingChip,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation
    )
        internal
        view
    {

        // Validate that the chip is part of a valid manufacturer enrollment
        bool isEnrolledChip = manufacturerRegistry.isEnrolledChip(
            _manufacturerValidation.enrollmentId,
            _provingChip,
            _manufacturerValidation.manufacturerCertificate
        );
        require(isEnrolledChip, "Chip not enrolled with ManufacturerRegistry");
    }


    /**
     * @dev Deploys a new ProjectRegistrar contract via CREATE2 and registers it to the Developer Registrar
     * 
     * @param _projectManager          The address that will be set as the owner of the project registrar contract
     * @param _nameHash                Keccak256 hash of the human-readable name for the chip being claimed
     * @param _projectPublicKey        Public key used in the generation of the Developer certificates
     */

    function _deployProjectRegistrarAndAddProject(
        address _projectManager,
        bytes32 _nameHash,
        address _projectPublicKey,
        bytes32 _serviceId,
        uint256 _lockinPeriod,
        bytes memory _projectOwnershipProof

    )
        internal
    {
        // TODO: verify nameHash works as a salt
        // Deploy new AuthenticityProjectRegistrar with Create2
        BaseProjectRegistrar newProjectRegistrar = new BaseProjectRegistrar{salt: _nameHash}(
            _projectManager, 
            chipRegistry, 
            ers, 
            developerRegistrar
        );

        // Register new Project Registrar to Developer Registrar
        developerRegistrar.addProject(
            _nameHash, 
            newProjectRegistrar, 
            _projectPublicKey, 
            _serviceId,
            transferPolicy,
            _lockinPeriod,
            _projectOwnershipProof
        );

        emit ProjectRegistrarDeployed(address(newProjectRegistrar), msg.sender);
    }
}

