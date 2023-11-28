//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IManufacturerRegistry } from "./interfaces/IManufacturerRegistry.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";
import { ITransferPolicy } from "./interfaces/ITransferPolicy.sol";
import { ITSMRegistrar } from "./interfaces/ITSMRegistrar.sol";
import { AuthenticityProjectRegistrar } from "./project-registrars/AuthenticityProjectRegistrar.sol";

/**
 * @title ArxProjectEnrollmentManager
 * @author Arx
 * 
 * @notice Smart contract that handles deployment of new Project Registrar contracts for new TSM projects.
 * This should be set as the owner of the TSM Registrar contract before adding any new projects.
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
    ITSMRegistrar public immutable tsmRegistrar;
    IERS public immutable ers;
    IManufacturerRegistry public immutable manufacturerRegistry;
    ITransferPolicy public transferPolicy;
    uint256 public maxBlockWindow;
    
    /* ============ Constructor ============ */
    /**
     * @param _chipRegistry             The Chip Registry contract of the ERS system
     * @param _tsmRegistrar             The TSM Registrar contract of the ERS system
     * @param _ers                      The ERS Registry contract of the ERS system
     * @param _manufacturerRegistry     The Manufacturer Registry contract of the ERS system
     * @param _transferPolicy           The transfer policy contract for the project being deployed
     * @param _maxBlockWindow           The maximum amount of blocks a signature used for updating chip table is valid for
     *                                  passed to all ProjectRegistrar contracts deployed by this contract
     */
    constructor(
        IChipRegistry _chipRegistry, 
        ITSMRegistrar _tsmRegistrar, 
        IERS _ers,
        IManufacturerRegistry _manufacturerRegistry,
        ITransferPolicy _transferPolicy,
        uint256 _maxBlockWindow
    )
        Ownable()
    {
        transferPolicy = _transferPolicy;
        chipRegistry = _chipRegistry;
        tsmRegistrar = _tsmRegistrar;
        manufacturerRegistry = _manufacturerRegistry;
        ers = _ers;
        maxBlockWindow = _maxBlockWindow;
    }

    /* ============ External Functions ============ */

    /**
      * @notice Adds a new TSM's project to the ERS system by deploying the ProjectRegistrar contract via CREATE2 and
      * registering it to the TSM Registrar. We use CREATE2 because we need the projectManager to provide proof of
      * ownership by signing a hash of the projectRegistrar address with the projectPublicKey. This is not possible
      * unless we know the address ahead of time, hence we use CREATE2 which allows us to know the address.
      * 
      * @param _projectManager          The address that will be set as the owner of the project registrar contract
      * @param _projectClaimDataUri     URI pointing to location of off-chain data required to claim chips
      * @param _nameHash                Keccak256 hash of the human-readable name for the chip being claimed
      * @param _merkleRoot              Merkle root of the TSM Merkle Tree made up of the chips enrolled to this project
      * @param _projectPublicKey        Public key used in the generation of the TSM certificates
      * @param _projectOwnershipProof   Signed hash of the _projectRegistrar address by the _projectPublicKey
      */
    function addProject(
        address _projectManager,
        string memory _projectClaimDataUri,
        bytes32 _nameHash,
        bytes32 _merkleRoot,
        address _projectPublicKey,
        address _provingChip,
        IChipRegistry.TSMMerkleInfo memory _tsmMerkleInfo,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation,
        bytes memory _chipOwnershipProof,
        bytes memory _projectOwnershipProof
    )
        public 
    {
        require(_isNotZeroAddress(_projectManager), "Invalid project manager address");
        require(_isNotZeroAddress(_projectPublicKey), "Invalid project public key address");

        _validateOwnershipAndTreeInclusion(
            _provingChip,
            _chipOwnershipProof,
            _merkleRoot,
            _tsmMerkleInfo,
            _manufacturerValidation
        );

        _deployProjectRegistrarAndAddProject(
            _projectManager,
            _merkleRoot,
            _nameHash,
            _projectPublicKey,
            _projectOwnershipProof,
            _projectClaimDataUri
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
     * @param _chipOwnershipProof           The signature of the chip owner over the hash of the chainId and msg.sender
     * @param _merkleRoot                   The merkle root of the project
     * @param _tsmMerkleInfo                The TSM Merkle Info of the chip
     * @param _manufacturerValidation       Manufacturer Validation info for the chip
     */
    function _validateOwnershipAndTreeInclusion(
        address _provingChip,
        bytes memory _chipOwnershipProof,
        bytes32 _merkleRoot,
        IChipRegistry.TSMMerkleInfo memory _tsmMerkleInfo,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation
    )
        internal
        view
    {
        // Validate chip ownership
        bytes32 msgHash = abi.encodePacked(block.chainid, msg.sender).toEthSignedMessageHash();
        require(_provingChip.isValidSignatureNow(msgHash, _chipOwnershipProof), "Invalid chip ownership proof");

        // Validate chip is included in merkle tree
        bytes32 node = keccak256(
            abi.encodePacked(
                _tsmMerkleInfo.tsmIndex,
                _provingChip,
                _manufacturerValidation.enrollmentId,
                _tsmMerkleInfo.lockinPeriod,
                _tsmMerkleInfo.serviceId,
                _tsmMerkleInfo.tokenUri
            )
        );

        require(MerkleProof.verify(_tsmMerkleInfo.tsmProof, _merkleRoot, node), "Invalid chip tree inclusion proof");

        // Validate that the chip is part of a valid manufacturer enrollment
        bool isEnrolledChip = manufacturerRegistry.isEnrolledChip(
            _manufacturerValidation.enrollmentId,
            _manufacturerValidation.mIndex,
            _provingChip,
            _manufacturerValidation.manufacturerProof
        );
        require(isEnrolledChip, "Chip not enrolled with ManufacturerRegistry");
    }

    /**
     * @dev Deploys a new ProjectRegistrar contract via CREATE2 and registers it to the TSM Registrar
     * 
     * @param _projectManager          The address that will be set as the owner of the project registrar contract
     * @param _merkleRoot              Merkle root of the TSM Merkle Tree made up of the chips enrolled to this project
     * @param _nameHash                Keccak256 hash of the human-readable name for the chip being claimed
     * @param _projectPublicKey        Public key used in the generation of the TSM certificates
     * @param _projectOwnershipProof   Signed hash of the _projectRegistrar address by the _projectPublicKey
     * @param _projectClaimDataUri     URI pointing to location of off-chain data required to claim chips
     */
    function _deployProjectRegistrarAndAddProject(
        address _projectManager,
        bytes32 _merkleRoot,
        bytes32 _nameHash,
        address _projectPublicKey,
        bytes memory _projectOwnershipProof,
        string memory _projectClaimDataUri
    )
        internal
    {
        // Deploy new AuthenticityProjectRegistrar with Create2
        AuthenticityProjectRegistrar newProjectRegistrar = new AuthenticityProjectRegistrar{salt: _merkleRoot}(
            _projectManager, 
            chipRegistry, 
            ers, 
            tsmRegistrar, 
            maxBlockWindow
        );

        // Register new Project Registrar to TSM Registrar
        tsmRegistrar.addProject(
            _nameHash, 
            newProjectRegistrar, 
            _merkleRoot, 
            _projectPublicKey, 
            transferPolicy, 
            _projectOwnershipProof,
            _projectClaimDataUri
        );

        emit ProjectRegistrarDeployed(address(newProjectRegistrar), msg.sender);
    }
}

