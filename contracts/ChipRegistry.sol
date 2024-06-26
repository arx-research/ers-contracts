//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { StringArrayUtils } from "./lib/StringArrayUtils.sol";
import { IERC165, ERC165 } from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IManufacturerRegistry } from "./interfaces/IManufacturerRegistry.sol";
import { IServicesRegistry } from "./interfaces/IServicesRegistry.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";
import { IDeveloperRegistrar } from "./interfaces/IDeveloperRegistrar.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";

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
contract ChipRegistry is Ownable2Step, ERC165, EIP712 {
    using SignatureChecker for address;
    using ECDSA for bytes;
    using StringArrayUtils for string[];

    /* ============ Events ============ */

    event ProjectEnrollmentAdded(                  // Emitted during addProjectEnrollment
        address indexed developerRegistrar,
        address indexed projectRegistrar,
        bytes32 nameHash,
        address servicesRegistry,
        bytes32 serviceId
    );

    event ProjectEnrollmentRemoved(                // Emitted during removeProjectEnrollment
        address indexed developerRegistrar,
        address indexed projectRegistrar,
        bytes32 nameHash
    );

    event ChipAdded(                              // Emitted during claimChip
        address indexed chipId,
        address indexed projectRegistrar,
        bytes32 indexed manufacturerEnrollmentId,
        address owner,
        bytes32 serviceId,
        bytes32 ersNode,
        bool    hasDeveloperCustodyProof
        
    );

    event MaxLockinPeriodUpdated(uint256 maxLockinPeriod);  // Emitted during updateMaxLockinPeriod
    event MigrationSignerUpdated(address migrationSigner);  // Emitted during updateMigrationSigner
    event RegistryInitialized(                              // Emitted during initialize
        address ers,
        address developerRegistry
    );

    /* ============ Structs ============ */

    // Do we need an identifier to replace the merkle root? nodehash?
    struct ProjectInfo {
        bytes32 nameHash;
        IDeveloperRegistrar developerRegistrar;
        IServicesRegistry servicesRegistry;
        bool chipsAdded;
        bytes32 serviceId;
        uint256 lockinPeriod;
        uint256 creationTimestamp;
    }

    struct ChipInfo {
        bytes32 nameHash;
        address projectRegistrar; // projectRegistrars are IProjectRegistrar and typically assumed to be IPBT
        bytes32 manufacturerEnrollmentId;     // enrollmentId of the chip's manufacturer
        bool chipEnrolled;
    }

    /* ============ Constants ============ */
    // Match signature version to project version.
    string public constant EIP712_SIGNATURE_DOMAIN = "ERS";
    string public constant EIP712_SIGNATURE_VERSION = "1.0.0";

    /* ============ State Variables ============ */
    IManufacturerRegistry public immutable manufacturerRegistry;
    IERS public ers;
    IDeveloperRegistry public developerRegistry;
    bool public initialized;
    address public migrationSigner;

    mapping(IProjectRegistrar => ProjectInfo) public projectEnrollments;  // Maps ProjectRegistrar addresses to ProjectInfo
    mapping(address => ChipInfo) public chipEnrollments;                  // Maps chipId to ChipInfo
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
        uint256 _maxLockinPeriod,
        address _migrationSigner
    )
        Ownable2Step()
        EIP712(EIP712_SIGNATURE_DOMAIN, EIP712_SIGNATURE_VERSION) 
    {
        require(address(_manufacturerRegistry) != address(0), "Invalid manufacturer registry address");
        require(_maxLockinPeriod <= 315569520, "maxLockinPeriod cannot exceed 10 years");
        require(_migrationSigner != address(0), "Invalid migration signer address");

        manufacturerRegistry = _manufacturerRegistry;
        maxLockinPeriod = _maxLockinPeriod;
        migrationSigner = _migrationSigner;
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
     * @param _projectRegistrar         Address of the ProjectRegistrar contract
     * @param _nameHash                 Label of the project's node in the ERS tree
     * @param _servicesRegistry         Address of the ServicesRegistry contract for the project
     * @param _serviceId                The serviceId of the project's preferred service
     * @param _lockinPeriod             The amount of time a chip can be locked into a service for beyond the project's creation timestamp
     */

    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        bytes32 _nameHash,
        IServicesRegistry _servicesRegistry,
        bytes32 _serviceId,
        uint256 _lockinPeriod
    )
        external
    {
        require(developerRegistry.isDeveloperRegistrar(msg.sender), "Must be Developer Registrar");
        require(address(_projectRegistrar) != address(0), "Invalid project registrar address");

        // Verify that the project registrar implements the necessary interfaces
        IERC165 checker = IERC165(address(_projectRegistrar));
        require(checker.supportsInterface(type(IProjectRegistrar).interfaceId), "Does not implement IProjectRegistrar");

        // Verify that the project isn't already enrolled
        require(projectEnrollments[_projectRegistrar].creationTimestamp == 0, "Project already enrolled");

        // Verify that the services registry implements the necessary interfaces
        require(IERC165(address(_servicesRegistry)).supportsInterface(type(IServicesRegistry).interfaceId), "Does not implement IServicesRegistry");

        // Look up the _serviceId to ensure it exists.
        require(_servicesRegistry.isService(_serviceId), "Service does not exist");

        projectEnrollments[_projectRegistrar] = ProjectInfo({
            nameHash: _nameHash,
            developerRegistrar: IDeveloperRegistrar(msg.sender),
            servicesRegistry: _servicesRegistry,
            serviceId: _serviceId,
            lockinPeriod: _lockinPeriod,
            creationTimestamp: block.timestamp,
            chipsAdded: false
        });

        emit ProjectEnrollmentAdded(
            msg.sender,
            address(_projectRegistrar),
            _nameHash,
            address(_servicesRegistry),
            _serviceId
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
     * @param _custodyProof                 Proof of chip custody by the developer; this can also be a migration proof
     */
    function addChip(
        address _chipId,
        address _chipOwner,
        bytes32 _nameHash,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation,
        bytes memory _custodyProof
    )
        external
        virtual
    {
        IProjectRegistrar projectRegistrar = IProjectRegistrar(msg.sender);
        ProjectInfo memory projectInfo = projectEnrollments[projectRegistrar];

        // Verify the chip owner is set to non-zero address
        require(_chipId != address(0), "Invalid chip");
    
        // Verify the chip owner is set to non-zero address
        require(_chipOwner != address(0), "Invalid chip owner");

        // Verify the chip is being added by an enrolled project
        require(projectInfo.creationTimestamp != 0, "Project not enrolled");

        // Verify that the chip doesn't exist yet
        require(!chipEnrollments[_chipId].chipEnrolled, "Chip already added");
        
        // Validate the manufacturer certificate
        _validateManufacturerCertificate(_chipId, _manufacturerValidation);

        // Validate the custody proof and determine if it is a developer custody proof or migration proof; will revert if invalid proof for both cases
        bool hasDeveloperCustodyProof = _isDeveloperCustodyProofAndValid(_chipId, address(projectInfo.developerRegistrar), _custodyProof);

        // Create the chip subnode record in the ERS
        bytes32 ersNode = _createChipSubnode(
            _calculateProjectERSNode(projectInfo),
            _nameHash,
            _chipOwner,
            address(projectInfo.servicesRegistry)
        );

        // Store chip information
        chipEnrollments[_chipId] = ChipInfo({
            nameHash: _nameHash,
            projectRegistrar: address(projectRegistrar),
            manufacturerEnrollmentId: _manufacturerValidation.enrollmentId,
            chipEnrolled: true
        });
       
        // Lockin Period is min of the lockinPeriod specified by the Developer and the max time period specified by governance
        uint256 lockinPeriod = projectInfo.creationTimestamp + maxLockinPeriod > projectInfo.creationTimestamp + projectInfo.lockinPeriod ?
            projectInfo.creationTimestamp + projectInfo.lockinPeriod :
            projectInfo.creationTimestamp + maxLockinPeriod;

        // Set primaryService on ServicesRegistry
        projectInfo.servicesRegistry.setInitialService(
            _chipId,
            projectInfo.serviceId,
            lockinPeriod
        );

        if (!projectInfo.chipsAdded) {
            projectEnrollments[projectRegistrar].chipsAdded = true;
        }

        emit ChipAdded(
            _chipId,
            address(projectRegistrar),
            _manufacturerValidation.enrollmentId,
            _chipOwner,
            projectInfo.serviceId,
            ersNode,
            hasDeveloperCustodyProof
        );
    }


    /**
     * @dev ONLY Developer REGISTRAR: Remove project enrollment from ChipRegistry. This function is only callable by DeveloperRegistrars. This
     * function will revert if the project is not enrolled or if the project has already added chips. This function will also remove the project
     * subnode record in the ERS.
     *
     * @param _projectRegistrar          Address of the ProjectRegistrar contract
     */
    function removeProjectEnrollment(IProjectRegistrar _projectRegistrar) external {
        require(developerRegistry.isDeveloperRegistrar(msg.sender), "Must be Developer Registrar");

        IDeveloperRegistrar developerRegistrar = IDeveloperRegistrar(msg.sender);
        ProjectInfo memory projectInfo = projectEnrollments[_projectRegistrar];

        // Check that the project registrar is valid
        require(address(_projectRegistrar) != address(0), "Invalid project registrar address");

        // Verify that the project is enrolled
        require(projectInfo.creationTimestamp != 0, "Project not enrolled");

        // Verify that the project is being removed by the correct developer registrar
        require(projectInfo.developerRegistrar == developerRegistrar, "Developer Registrar does not own project");

        // Verify that the project has not added chips
        require(!projectInfo.chipsAdded, "Cannot remove project with chips added");

        // Get the project's nameHash
        bytes32 nameHash = projectInfo.nameHash;

        // Remove the chip subnode record in the ERS
        ers.deleteChipRegistrySubnodeRecord(
            developerRegistrar.rootNode(),
            nameHash
        );

        delete projectEnrollments[_projectRegistrar];

        emit ProjectEnrollmentRemoved(
            msg.sender,
            address(_projectRegistrar),
            nameHash
        );
    }

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
        ChipInfo memory chipInfo = chipEnrollments[_chipId];

        require(chipInfo.chipEnrolled, "Chip not added");
        require(chipInfo.projectRegistrar == address(projectRegistrar), "ProjectRegistrar did not add chip");

        bytes32 _nameHash = chipInfo.nameHash;
        bytes32 rootNode = _calculateProjectERSNode(projectEnrollments[projectRegistrar]);
       
        bytes32 chipErsNode = keccak256(abi.encodePacked(rootNode, _nameHash));
        ers.setNodeOwner(chipErsNode, _newOwner);
    }

    /* ============ External Admin Functions ============ */

    /**
     * @notice ONLY OWNER: Initialize ChipRegistry contract with ERS and Services Registry addresses. Required due to order of operations
     * during deploy.
     *
     * @param _ers                       Address of the ERS contract
     * @param _developerRegistry         Address of the DeveloperRegistry contract
     */
    function initialize(IERS _ers, IDeveloperRegistry _developerRegistry) external onlyOwner {
        require(!initialized, "Contract already initialized");
        ers = _ers;
        developerRegistry = _developerRegistry;

        initialized = true;
        emit RegistryInitialized(address(_ers), address(_developerRegistry));
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

    /**
     * @notice ONLY OWNER: Update the migration signer address
     *
     * @param _migrationSigner         The new migration signer address
     */
    function updateMigrationSigner(address _migrationSigner) external onlyOwner {
        migrationSigner = _migrationSigner;
        emit MigrationSignerUpdated(_migrationSigner);
    }

    /* ============ View Functions ============ */

    /**
     * @notice Return the primary service content.
     *
     * @param _chipId           The chip public key
     * @return                  The content associated with the chip (if chip has been claimed already)
     */
    function resolveChip(address _chipId) external view returns (IServicesRegistry.Record[] memory) {
        require(chipEnrollments[_chipId].chipEnrolled, "Chip not added");
        IServicesRegistry _servicesRegistry = IServicesRegistry(ers.getResolver(node(_chipId)));
        return _servicesRegistry.getPrimaryServiceContent(_chipId);
    }

    /**
     * @notice Get the chip's ERS node (function name follows ENS reverse registar naming conventions)
     *
     * @param _chipId           The chip public key
     * @return                  The ERS node of the chip
     */
    function node(address _chipId) public view virtual returns (bytes32) {
        ProjectInfo memory projectInfo = projectEnrollments[IProjectRegistrar(chipEnrollments[_chipId].projectRegistrar)];
        ChipInfo memory chipInfo = chipEnrollments[_chipId];

        require(chipInfo.chipEnrolled, "Chip not added");

        bytes32 rootNode = _calculateProjectERSNode(projectInfo);
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
        require(chipEnrollments[_chipId].chipEnrolled, "Chip not added");
        IProjectRegistrar projectRegistrar = IProjectRegistrar(chipEnrollments[_chipId].projectRegistrar);

        return projectRegistrar.ownerOf(_chipId);
    } 

        /**
     * 
     * @param _interfaceId The interface ID to check for
     */
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        virtual
        override(ERC165)
        returns (bool)
    {
        return _interfaceId == type(IChipRegistry).interfaceId ||
        super.supportsInterface(_interfaceId);
    }

    /* ============ Internal Functions ============ */

    /**
     * @notice Create a chip subnode record in the ERS; if resolver is not set, set to services registry
     *
     * @param _rootNode         The root node of the project
     * @param _nameHash         The namehash of the chip
     * @param _owner            The owner of the chip
     * @param _resolver         The resolver of the chip
     * @return                  The ERS node of the chip
     */
    function _createChipSubnode(
        bytes32 _rootNode,
        bytes32 _nameHash,
        address _owner,
        address _resolver
    )
        internal
        returns (bytes32)
    {
        // Create the chip subnode record in the ERS; if the node already exists, this should revert
        return ers.createChipRegistrySubnodeRecord(
            _rootNode, 
            _nameHash, 
            _owner, 
            _resolver
        );
    }

    /**
     * @notice Calculate the project's ERS node
     *
     * @param _projectInfo      Struct containing information about the project
     * @return                  The project's ERS node
     */
    function _calculateProjectERSNode(ProjectInfo memory _projectInfo) internal view returns (bytes32) {
        return ers.getSubnodeHash(_projectInfo.developerRegistrar.rootNode(), _projectInfo.nameHash);
    }

    /**
     * @notice Validate the manufacturer certificate for a chip
     *
     * @param chipId                The chip public key
     * @param _manufacturerValidation Struct containing information for chip's inclusion in manufacturer's merkle tree
     */
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
            _manufacturerValidation.manufacturerCertificate,
            _manufacturerValidation.payload
        );
        bool isValidEnrollment = manufacturerRegistry.isValidEnrollment(_manufacturerValidation.enrollmentId);
        require(isValidEnrollment, "Expired manufacturer enrollment");
        require(isEnrolledChip, "Chip not enrolled with ManufacturerRegistry");
    }

    /**
     * 
     * @notice Validate the developer custody proof for a chip; should return true if the developer signed the developer address, 
     * false if the migration signer signed the chipId and should revert if the proof is invalid for either case.
     * 
     * @param _chipId                 The chip public key
     * @param _developerRegistrar     The developer's registrar address
     * @param _custodyProof           The developer's custody proof or migration proof
     */
    function _isDeveloperCustodyProofAndValid(
        address _chipId,
        address _developerRegistrar,
        bytes memory _custodyProof
    )
        internal
        view
        returns (bool)
    {
        // For developer custody proofs, the chip signs the developer address. For migration proofs the migration signer signs the chipId
        bytes32 developerDigest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("DeveloperCustodyProof(address developerRegistrar)"),
            _developerRegistrar
        )));
        bytes32 migrationDigest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("MigrationProof(address chipId)"),
            _chipId
        )));

        // If the developer signed the developer address, return 
        if(_chipId.isValidSignatureNow(developerDigest, _custodyProof))
            return true;
        else if(migrationSigner.isValidSignatureNow(migrationDigest, _custodyProof))
            return false;
        else
            revert("Invalid custody proof");
    }
}
