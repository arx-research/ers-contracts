//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IManufacturerRegistry } from "./interfaces/IManufacturerRegistry.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";
import { IServicesRegistry } from "./interfaces/IServicesRegistry.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";
import { IDeveloperRegistrar } from "./interfaces/IDeveloperRegistrar.sol";
import { IPBT } from "./token/IPBT.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { StringArrayUtils } from "./lib/StringArrayUtils.sol";

/**
 * @title ChipRegistry
 * @author Arx
 *
 * @notice Entrypoint for resolving chips added to ERS Protocol. Developers can enroll new projects into this registry by 
 * specifying a ProjectRegistrar to manage chip additions. Chip additions are forwarded from ProjectRegistrars that typically 
 * mint an ERC-721 compliant "token" of the chip to the claimant and other metadata associated with the chip is set. 
 * Any project looking to integrate ERS chips should get resolution information about chips from this address. Because 
 * chips are represented as tokens any physical chip transfers should also be completed on-chain in order to get full 
 * functionality for the chip.
 */
contract ChipRegistry is Ownable {
    using SignatureChecker for address;
    using ECDSA for bytes;
    using StringArrayUtils for string[];

    /* ============ Events ============ */

    event ProjectEnrollmentAdded(                   // Emitted during addProjectEnrollment
        address indexed developerRegistrar,
        address indexed projectRegistrar
    );

    event ChipAdded(                              // Emitted during claimChip
        address indexed chipId,
        address indexed owner,
        bytes32 serviceId,
        bytes32 ersNode,
        bytes32 indexed enrollmentId
    );

    event MaxLockinPeriodUpdated(uint256 maxLockinPeriod);  // Emitted during updateMaxLockinPeriod
    event RegistryInitialized(                              // Emitted during initialize
        address ers,
        address servicesRegistry,
        address developerRegistry
    );

    /* ============ Structs ============ */

    // Do we need an identifier to replace the merkle root? nodehash?
    struct ProjectInfo {
        bytes32 nameHash;
        bytes32 serviceId;
        uint256 lockinPeriod;
        uint256 creationTimestamp;
        bool chipsAdded;
    }

    struct ChipInfo {
        bytes32 nameHash;
        address projectRegistrar; // projectRegistrars are both IPBT and IProjectRegistrar
        bytes32 enrollmentId;     // enrollmentId of the chip's manufacturer
        bool chipAdded;
    }

    /* ============ State Variables ============ */
    IManufacturerRegistry public immutable manufacturerRegistry;
    IERS public ers;
    IServicesRegistry public servicesRegistry;
    IDeveloperRegistry public developerRegistry;
    bool public initialized;

    mapping(IProjectRegistrar => ProjectInfo) public projectEnrollments;  // Maps ProjectRegistrar addresses to ProjectInfo
    mapping(address => ChipInfo) public chipEnrollments;                         // Maps chipId to ChipInfo
    uint256 public maxLockinPeriod;                                       // Max amount of time chips can be locked into a service after a
                                                                          // project's creation timestamp

    /* ============ Constructor ============ */

    /**
     * @notice Constructor for ChipRegistry
     *
     * @param _manufacturerRegistry     Address of the ManufacturerRegistry contract
     * @param _maxLockinPeriod          The maximum amount of time a chip can be locked into a service for beyond the project's creation timestamp
    */
    constructor(
        IManufacturerRegistry _manufacturerRegistry,
        uint256 _maxLockinPeriod
    )
        Ownable()
    {
        manufacturerRegistry = _manufacturerRegistry;
        maxLockinPeriod = _maxLockinPeriod;
    }

    /* ============ External Functions ============ */

    /**
     * @dev ONLY Developer REGISTRAR: Enroll new project in ChipRegistry. This function is only callable by DeveloperRegistrars. In order to use
     * this function the project must first sign a message of the _projectRegistrar address with the _projectPublicKey's matching
     * private key. This key MUST be the same key used to sign all the chip certificates for the project. This creates a link between
     * chip certificates (which may be posted online) and the deployer of the registrar hence making sure that no malicious Developer is able
     * to steal another Developer's chips for their own enrollment (unless the private key happens to be leaked). This function will
     * revert if the project is already enrolled. See documentation for more instructions on how to create a project merkle root.
     *
     * @param _projectRegistrar          Address of the ProjectRegistrar contract
     *                                   key that signed the chip custodyProofs and developerInclusionProofs   
     */

    // TODO: we may want to allow governance to remove projects with no chips added after a certain period of time
    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        bytes32 _nameHash,
        bytes32 serviceId,
        uint256 lockinPeriod
    )
        external
    {
        require(developerRegistry.isDeveloperRegistrar(msg.sender), "Must be Developer Registrar");
        IDeveloperRegistrar developerRegistrar = IDeveloperRegistrar(msg.sender);

        // Verify that the project registrar implements the necessary interfaces
        IERC165 checker = IERC165(address(_projectRegistrar));
        require(checker.supportsInterface(type(IPBT).interfaceId), "Does not implement IPBT");
        require(checker.supportsInterface(type(IProjectRegistrar).interfaceId), "Does not implement IProjectRegistrar");

        // TODO: is this a sufficient check for existence?
        // Verify that the project isn't already enrolled
        require(projectEnrollments[_projectRegistrar].creationTimestamp == 0, "Project already enrolled");
        
        // // When enrolling a project, public key cannot be zero address so we can use as check to make sure calling address is associated
        // // with a project enrollment during claim
        require(address(_projectRegistrar) != address(0), "Invalid project registrar address");

        // Get the project's root node which is used in the creation of the subnode
        bytes32 rootNode = developerRegistrar.rootNode();

        // Create the chip subnode record in the ERS
        ers.createChipRegistrySubnodeRecord(
            rootNode,
            _nameHash,
            address(_projectRegistrar),
            address(_projectRegistrar)
        );

        projectEnrollments[_projectRegistrar] = ProjectInfo({
            nameHash: _nameHash,
            serviceId: serviceId,
            lockinPeriod: lockinPeriod,
            creationTimestamp: block.timestamp,
            chipsAdded: false
        });

        emit ProjectEnrollmentAdded(
            msg.sender,
            address(_projectRegistrar)
        );
    }

    /**
     * @notice Allow a project to add chips. Enrollment allows the chip to resolve to the project's preferred
     * service. Additionally, claiming creates a Physically-Bound Token representation of the chip.
     *
     * @dev This function will revert if the chip has already been added, if invalid certificate data is provided or if the chip is
     * not part of the project enrollment (not in the project merkle root). Addtionally, there are checks to ensure that the calling
     * ProjectRegistrar has implemented the correct ERS logic. This function is EIP-1271 compatible and can be used to verify chip
     * claims tied to an account contract.
     *
     * @param _chipId                       Chip ID (address)
     * @param _chipOwner                    Struct containing information for validating merkle proof, chip owner, and chip's ERS node
     * @param _nameHash                     Label of the node in the ERS tree; typically the chipId unless the project wishes to use 
     *                                      another unique identifier. The full ersNode will be used as the tokenId for the issued PBT.
     * @param _manufacturerValidation       Struct containing information for chip's inclusion in manufacturer's merkle tree
     */
    
    function addChip(
        address _chipId,
        address _chipOwner,
        bytes32 _nameHash,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation
    )
        external
        virtual
    {
        IProjectRegistrar projectRegistrar = IProjectRegistrar(msg.sender);
        ProjectInfo memory projectInfo = projectEnrollments[projectRegistrar];
        
        // Verify the chip owner is set to non-zero address
        require(_chipId != address(0), "Invalid chip");
    
        // Verify the chip is being added by an enrolled project
        require(projectInfo.creationTimestamp != 0, "Project not enrolled");

        // Verify that the chip doesn't exist yet
        require(!chipEnrollments[_chipId].chipAdded, "Chip already added");

        // TODO: do we care if chip owner is 0?
        // Verify the chip owner is set to non-zero address
        require(_chipOwner != address(0), "Invalid chip owner");
        
        // Validate the manufacturer certificate
        _validateManufacturerCertificate(_chipId, _manufacturerValidation);

        // Get the project's root node which is used in the creation of the subnode
        bytes32 rootNode = projectRegistrar.rootNode();

        // Create the chip subnode record in the ERS; if the node already exists, this should revert
        ers.createChipRegistrySubnodeRecord(
            rootNode, 
            _nameHash, 
            _chipOwner, 
            address(servicesRegistry)
        );

        // Store chip information
        chipEnrollments[_chipId] = ChipInfo({
            nameHash: _nameHash,
            projectRegistrar: address(projectRegistrar),
            enrollmentId: _manufacturerValidation.enrollmentId,
            chipAdded: true
        });

        // TODO: remove, redundant with createChipRegistrySubnodeRecord.
        // Verify the chip's ERS node was created by the ProjectRegistrar; this is the source of truth for the chip's ownership
        bytes32 ersNode = keccak256(abi.encodePacked(rootNode, _nameHash));
       
        // Lockin Period is min of the lockinPeriod specified by the Developer and the max time period specified by governance
        uint256 lockinPeriod = projectInfo.creationTimestamp + maxLockinPeriod > projectInfo.lockinPeriod ?
            projectInfo.lockinPeriod :
            projectInfo.creationTimestamp + maxLockinPeriod;
        
        // Set primaryService on ServicesRegistry
        servicesRegistry.setInitialService(
            _chipId,
            projectInfo.serviceId,
            lockinPeriod
        );

        if (!projectInfo.chipsAdded) {
            projectEnrollments[projectRegistrar].chipsAdded = true;
        }

        emit ChipAdded(
            _chipId,
            _chipOwner,
            projectInfo.serviceId,
            ersNode,
            _manufacturerValidation.enrollmentId
        );
    }

    /**
     * Get ERS node from tokenData and then sets the new Owner of the chip on the ERSRegistry.
     */

    /**
     * @notice Set the owner of a chip through its projectRegistrar
     *
     * @param _chipId           The chip public key
     * @param _newOwner         The new owner of the chip
     */
    function setChipNodeOwner(
        address _chipId, 
        address _newOwner
    ) 
        external 
    {
        IProjectRegistrar projectRegistrar = IProjectRegistrar(msg.sender);

        require(projectEnrollments[projectRegistrar].chipsAdded, "Only enrolled projects with chips can call.");
        require(chipEnrollments[_chipId].chipAdded, "Chip not added");
        require(chipEnrollments[_chipId].projectRegistrar == address(projectRegistrar), "ProjectRegistrar does not own chip");

        bytes32 _nameHash = chipEnrollments[_chipId].nameHash;
        bytes32 rootNode = projectRegistrar.rootNode();
       
        bytes32 chipErsNode = keccak256(abi.encodePacked(rootNode, keccak256(abi.encodePacked(_nameHash))));
        ers.setNodeOwner(chipErsNode, _newOwner);
    }

    /* ============ External Admin Functions ============ */

    /**
     * @notice ONLY OWNER: Initialize ChipRegistry contract with ERS and Services Registry addresses. Required due to order of operations
     * during deploy.
     *
     * @param _ers                       Address of the ERS contract
     * @param _servicesRegistry          Address of the ServicesRegistry contract
     * @param _developerRegistry         Address of the DeveloperRegistry contract
     */
    function initialize(IERS _ers, IServicesRegistry _servicesRegistry, IDeveloperRegistry _developerRegistry) external onlyOwner {
        require(!initialized, "Contract already initialized");
        ers = _ers;
        servicesRegistry = _servicesRegistry;
        developerRegistry = _developerRegistry;

        initialized = true;
        emit RegistryInitialized(address(_ers), address(_servicesRegistry), address(_developerRegistry));
    }

    /**
     * @notice ONLY OWNER: Update the maximum amount of time a chip can be locked into a service for beyond the project's creation timestamp
     *
     * @param _maxLockinPeriod         The new maximum amount of time a chip can be locked into a service for beyond the project's creation timestamp
     */
    function updateMaxLockinPeriod(uint256 _maxLockinPeriod) external onlyOwner {
        require(_maxLockinPeriod > 0, "Invalid lockin period");

        maxLockinPeriod = _maxLockinPeriod;
        emit MaxLockinPeriodUpdated(_maxLockinPeriod);
    }

    /* ============ View Functions ============ */

    /**
     * @notice Return the primary service content.
     *
     * @param _chipId           The chip public key
     * @return                  The content associated with the chip (if chip has been claimed already)
     */
    function resolveChipId(address _chipId) external view returns (IServicesRegistry.Record[] memory) {
        require(chipEnrollments[_chipId].chipAdded, "Chip not added");
        return servicesRegistry.getPrimaryServiceContent(_chipId);
    }

    /**
     * @notice Get the chip's ERS node
     *
     * @param _chipId           The chip public key
     * @return                  The ERS node of the chip
     */
    function getChipNode(address _chipId) external view returns (bytes32) {
        require(chipEnrollments[_chipId].chipAdded, "Chip not added");
        IProjectRegistrar projectRegistrar = IProjectRegistrar(chipEnrollments[_chipId].projectRegistrar);
        bytes32 rootNode = projectRegistrar.rootNode();
        bytes32 nameHash = chipEnrollments[_chipId].nameHash;

        return keccak256(abi.encodePacked(rootNode, nameHash));
    }

    /**
     * @notice Get the owner of a chip through its projectRegistrar
     *
     * @param _chipId           The chip public key
     * @return                  The owner of the chip
     */
    function ownerOf(address _chipId) public view virtual returns (address) {
        require(chipEnrollments[_chipId].chipAdded, "Chip not added");
        IPBT projectRegistrar = IPBT(chipEnrollments[_chipId].projectRegistrar);

        return projectRegistrar.ownerOf(_chipId);
    } 

    /* ============ Internal Functions ============ */

    function _validateManufacturerCertificate(
        address chipId,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation
    )
        internal
        view
    {
        bool isEnrolledChip = manufacturerRegistry.isEnrolledChip(
            _manufacturerValidation.enrollmentId,
            chipId,
            _manufacturerValidation.manufacturerCertificate
        );
        require(isEnrolledChip, "Chip not enrolled with ManufacturerRegistry");
    }

    /**
     * @notice Grab passed record type of primary service. For purposes of use within this contract we convert bytes
     * to string
     *
     * @param _chipId          Chip's address
     * @param _recordType      Bytes32 hash representing the record type being queried
     * @return                 Content cotained in _recordType
     */
    function _getChipPrimaryServiceContentByRecordType(
        address _chipId,
        bytes32 _recordType
    )
        internal
        view
        returns (string memory)
    {
        bytes memory content = servicesRegistry.getPrimaryServiceContentByRecordtype(_chipId, _recordType);
        return string(content);
    }
}
