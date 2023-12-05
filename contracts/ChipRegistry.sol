//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IERC721Metadata } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { ClaimedPBT } from "./token/ClaimedPBT.sol";
import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IERS } from "./interfaces/IERS.sol";
import { IManufacturerRegistry } from "./interfaces/IManufacturerRegistry.sol";
import { IPBT } from "./token/IPBT.sol";
import { IProjectRegistrar } from "./interfaces/IProjectRegistrar.sol";
import { IServicesRegistry } from "./interfaces/IServicesRegistry.sol";
import { ITransferPolicy } from "./interfaces/ITransferPolicy.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";
import { StringArrayUtils } from "./lib/StringArrayUtils.sol";

/**
 * @title ChipRegistry
 * @author Arx
 *
 * @notice Entrypoint for resolving chips added to Arx Protocol. Developers can enroll new projects into this registry by specifying a
 * ProjectRegistrar to manage chip claims. Chip claims are forwarded from ProjectRegistrars at which point a ERC-721
 * compliant "token" of the chip is minted to the claimant and other metadata associated with the chip is set. Any project
 * looking to integrate ERS chips should get resolution information about chips from this address. Because chips are
 * represented as tokens any physical chip transfers should also be completed on-chain in order to get full functionality
 * for the chip.
 */
contract ChipRegistry is IChipRegistry, ClaimedPBT, EIP712, Ownable {

    using SignatureChecker for address;
    using ECDSA for bytes;
    using StringArrayUtils for string[];

    /* ============ Errors ============ */
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

    /* ============ Events ============ */

    event ProjectEnrollmentAdded(                   // Emitted during addProjectEnrollment
        address indexed developerRegistrar,
        address indexed projectRegistrar,
        address indexed transferPolicy,
        address projectPublicKey,
        bytes32 merkleRoot,
        string projectClaimDataUri
    );

    event ProjectMerkleRootUpdated(                 // Emitted during updateProjectMerkleRoot
        address indexed projectRegistrar,
        bytes32 merkleRoot,
        string projectClaimDataUri
    );

    event ChipClaimed(                              // Emitted during claimChip
        address indexed chipId,
        uint256 tokenId,
        address indexed owner,
        bytes32 serviceId,
        bytes32 ersNode,
        bytes32 indexed enrollmentId,
        string tokenUri
    );

    event GatewayURLAdded(string gatewayUrl);               // Emitted during addGatewayURL
    event GatewayURLRemoved(string gatewayUrl);             // Emitted during removeGatewayURL
    event MaxLockinPeriodUpdated(uint256 maxLockinPeriod);  // Emitted during updateMaxLockinPeriod
    event RegistryInitialized(                              // Emitted during initialize
        address ers,
        address servicesRegistry,
        address developerRegistry
    );

    /* ============ Structs ============ */

    struct ProjectInfo {
        bytes32 merkleRoot;
        address projectPublicKey;
        ITransferPolicy transferPolicy;
        uint256 creationTimestamp;
        bool claimsStarted;
        string projectClaimDataUri;
    }
    
    /* ============ Constants ============ */
    bytes32 public constant URI_RECORDTYPE = bytes32("tokenUri");
    bytes32 public constant REDIRECT_URL_RECORDTYPE = bytes32("redirectUrl");
    
    /* ============ State Variables ============ */
    IManufacturerRegistry public immutable manufacturerRegistry;
    IERS public ers;
    IServicesRegistry public servicesRegistry;
    IDeveloperRegistry public developerRegistry;
    bool public initialized;

    mapping(IProjectRegistrar=>ProjectInfo) public projectEnrollments;  // Maps ProjectRegistrar addresses to ProjectInfo
    string[] internal gatewayUrls;                                      // Array of gateway URLs for resolving unclaimed chips using EIP-3668
    uint256 public maxLockinPeriod;                                     // Max amount of time chips can be locked into a service after a
                                                                        // project's creation timestamp

    /* ============ Constructor ============ */

    /**
     * @notice Constructor for ChipRegistry
     *
     * @param _manufacturerRegistry     Address of the ManufacturerRegistry contract
     * @param _gatewayUrls              Array of gateway URLs for resolving unclaimed chips using EIP-3668
     * @param _maxBlockWindow           The maximum amount of blocks a signature used for updating chip table is valid for
     * @param _maxLockinPeriod          The maximum amount of time a chip can be locked into a service for beyond the project's creation timestamp
    */
    constructor(
        IManufacturerRegistry _manufacturerRegistry,
        string[] memory _gatewayUrls,
        uint256 _maxBlockWindow,
        uint256 _maxLockinPeriod
    )
        ClaimedPBT("ERS", "ERS", _maxBlockWindow)
        EIP712("Ethereum Reality Service", "1")
        Ownable()
    {
        manufacturerRegistry = _manufacturerRegistry;
        gatewayUrls = _gatewayUrls;
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
     * @param _projectPublicKey          Public key of the project (used to sign chip certificates and create _signature)
     * @param _transferPolicy            Address of the transfer policy contract governing chip transfers
     * @param _merkleRoot                Merkle root of the project's chip claims
     * @param _projectOwnershipProof     Signature of the _projectRegistrar address signed by the _projectPublicKey. Proves ownership over the
     *                                   key that signed the chip custodyProofs and developerInclusionProofs   
     * @param _projectClaimDataUri       URI pointing to location of off-chain data required to claim chips
     */
    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        address _projectPublicKey,
        ITransferPolicy _transferPolicy,
        bytes32 _merkleRoot,
        bytes calldata _projectOwnershipProof,
        string calldata _projectClaimDataUri
    )
        external
    {
        require(developerRegistry.isDeveloperRegistrar(msg.sender), "Must be Developer Registrar");
        require(projectEnrollments[_projectRegistrar].projectPublicKey == address(0), "Project already enrolled");
        // When enrolling a project, public key cannot be zero address so we can use as check to make sure calling address is associated
        // with a project enrollment during claim
        require(_projectPublicKey != address(0), "Invalid project public key");

        // Use EIP-712 to verify that the projectPublicKey signed the _projectRegistrar address
        bytes32 messageHash = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("Contents(address projectRegistrar)"),
            address(_projectRegistrar)
        )));
        require(_projectPublicKey.isValidSignatureNow(messageHash, _projectOwnershipProof), "Invalid signature");

        projectEnrollments[_projectRegistrar] = ProjectInfo({
            merkleRoot: _merkleRoot,
            projectPublicKey: _projectPublicKey,
            transferPolicy: _transferPolicy,
            projectClaimDataUri: _projectClaimDataUri,
            creationTimestamp: block.timestamp,
            claimsStarted: false
        });

        emit ProjectEnrollmentAdded(
            msg.sender,
            address(_projectRegistrar),
            _projectPublicKey,
            address(_transferPolicy),
            _merkleRoot,
            _projectClaimDataUri
        );
    }

    /**
     * @dev Update the merkle root of a project enrollment. This function is only callable by the project's public key. This function
     * will revert if the project has already claimed a chip from this enrollment or the 7-day update time period has elapsed. New URI
     * is required because IPFS records are immutable so changing the merkle root would require a new IPFS record.
     *
     * @param _projectRegistrar          Address of the ProjectRegistrar contract
     * @param _merkleRoot                Merkle root of the project's chip claims
     * @param _projectClaimDataUri       URI pointing to location of off-chain data required to claim chips
     */
    function updateProjectMerkleRoot(
        IProjectRegistrar _projectRegistrar,
        bytes32 _merkleRoot,
        string calldata _projectClaimDataUri
    )
        external
    {
        require(msg.sender == projectEnrollments[_projectRegistrar].projectPublicKey, "Caller must be project public key");
        require(projectEnrollments[_projectRegistrar].creationTimestamp + 30 days > block.timestamp, "Update period has elapsed");
        require(!projectEnrollments[_projectRegistrar].claimsStarted, "Claims have already started");

        projectEnrollments[_projectRegistrar].merkleRoot = _merkleRoot;
        projectEnrollments[_projectRegistrar].projectClaimDataUri = _projectClaimDataUri;
        
        emit ProjectMerkleRootUpdated(address(_projectRegistrar), _merkleRoot, _projectClaimDataUri);
    }

    /**
     * @notice Allow a user to claim a chip from a project enrollment. Enrollment allows the chip to resolve to the project's preferred
     * service. Additionally, claiming creates a Physically-Bound Token representation of the chip.
     *
     * @dev This function will revert if the chip has already been claimed, if invalid certificate data is provided or if the chip is
     * not part of the project enrollment (not in the project merkle root). Addtionally, there are checks to ensure that the calling
     * ProjectRegistrar has implemented the correct ERS logic. This function is EIP-1271 compatible and can be used to verify chip
     * claims tied to an account contract.
     *
     * @param _chipId                       Chip ID (address)
     * @param _chipClaim                    Struct containing information for validating merkle proof, chip owner, and chip's ERS node
     * @param _manufacturerValidation       Struct containing information for chip's inclusion in manufacturer's merkle tree
     * @param _developerInclusionProof      Signature of the chipId signed by the project's public key
     * @param _developerCustodyProof        Signature of the projectPublicKey signed by the chip's private key
     */
    function claimChip(
        address _chipId,
        ChipClaim calldata _chipClaim,
        ManufacturerValidation memory _manufacturerValidation,
        bytes memory _developerInclusionProof,
        bytes memory _developerCustodyProof
    )
        external virtual
    {
        ProjectInfo memory projectInfo = projectEnrollments[IProjectRegistrar(msg.sender)];

        require(chipTable[_chipId].tokenId == 0, "Chip already claimed");
        require(_chipClaim.owner != address(0), "Invalid chip owner");
        require(projectInfo.projectPublicKey != address(0), "Project not enrolled");
        
        // Validate that chip state has been set correctly in ERS
        require(ers.isValidChipState(_chipClaim.ersNode, _chipId, _chipClaim.owner), "Inconsistent state in ERS");

        _validateCertificates(_chipId, projectInfo.projectPublicKey, _developerInclusionProof, _developerCustodyProof);

        // Validate merkle proofs verifying enrollment in project and project using manufacturer chips
        _validateDeveloperMerkleProof(
            _chipId,
            _chipClaim.developerMerkleInfo,
            _manufacturerValidation.enrollmentId,
            projectInfo.merkleRoot
        );
        _validateManufacturerMerkleProof(_chipId, _manufacturerValidation);

        // Lockin Period is min of the lockinPeriod specified by the Developer and the max time period specified by governance
        uint256 lockinPeriod = projectInfo.creationTimestamp + maxLockinPeriod > _chipClaim.developerMerkleInfo.lockinPeriod ?
            _chipClaim.developerMerkleInfo.lockinPeriod :
            projectInfo.creationTimestamp + maxLockinPeriod;
        
        // Set primaryService on ServicesRegistry
        servicesRegistry.setInitialService(
            _chipId,
            _chipClaim.developerMerkleInfo.serviceId,
            lockinPeriod
        );

        ChipInfo memory chipInfo = ChipInfo({
            tokenId: 0,     // temporary value, will be set in _mint
            transferPolicy: projectInfo.transferPolicy,
            tokenUri: _chipClaim.developerMerkleInfo.tokenUri,
            tokenData: _encodeTokenData(_chipClaim.ersNode, _manufacturerValidation.enrollmentId)
        });
        // Mint a PBT this function fills out the ownership mapping, maps tokenId to chipId, fills out
        // the chip table and increments the tokenIdCounter
        uint256 tokenId = ClaimedPBT._mint(_chipClaim.owner, _chipId, chipInfo);

        if (!projectInfo.claimsStarted) {
            projectEnrollments[IProjectRegistrar(msg.sender)].claimsStarted = true;
        }

        emit ChipClaimed(
            _chipId,
            tokenId,
            _chipClaim.owner,
            _chipClaim.developerMerkleInfo.serviceId,
            _chipClaim.ersNode,
            _manufacturerValidation.enrollmentId,
            _chipClaim.developerMerkleInfo.tokenUri
        );
    }

    /**
     * @notice Included for compliance with EIP-5791 standard but left unimplemented to ensure transfer policies can't be ignored.
     */
    function transferTokenWithChip(
        bytes calldata /*signatureFromChip*/,
        uint256 /*blockNumberUsedInSig*/,
        bool /*useSafeTransfer*/
    )
        public
        virtual
        override(ClaimedPBT, IPBT)
    {
        revert("Not implemented");
    }

    /**
     * @notice Allow a user to transfer a chip to a new owner, new owner must submit transaction. Use ClaimedPBT logic which calls
     * TransferPolicy to execute the transfer of the PBT and chip. Update chip's ERS node in order to keep data consistency. EIP-1271
     * compatibility should be implemented in the chip's TransferPolicy contract.
     *
     * @param chipId                Chip ID (address) of chip being transferred
     * @param signatureFromChip     Signature of keccak256(msg.sender, blockhash(blockNumberUsedInSig), _payload) signed by chip
     *                              being transferred
     * @param blockNumberUsedInSig  Block number used in signature
     * @param useSafeTransferFrom   Indicates whether to use safeTransferFrom or transferFrom
     * @param payload               Encoded payload containing data required to execute transfer. Data structure will be dependent
     *                              on implementation of TransferPolicy
     */
    function transferToken(
        address chipId,
        bytes calldata signatureFromChip,
        uint256 blockNumberUsedInSig,
        bool useSafeTransferFrom,
        bytes calldata payload
    ) 
        public
        override(ClaimedPBT, IPBT)
    {
        // Validations happen in ClaimedPBT / TransferPolicy
        ClaimedPBT.transferToken(chipId,  signatureFromChip, blockNumberUsedInSig, useSafeTransferFrom, payload);
        _setERSOwnerForChip(chipId, msg.sender);
    }

    /**
     * @dev ONLY CHIP OWNER (enforced in ClaimedPBT): Sets the owner for a chip. Chip owner must submit transaction
     * along with a signature from the chipId commiting to a block the signature was generated. This is to prevent
     * any replay attacks. If the transaction isn't submitted within the MAX_BLOCK_WINDOW from the commited block
     * this function will revert. Additionally, the chip's ERS node owner is updated to maintain state consistency.
     *
     * @param _chipId           The chipId to set the owner for
     * @param _newOwner         The address of the new chip owner
     * @param _commitBlock      The block the signature is tied to (used to put a time limit on the signature)
     * @param _signature        The signature generated by the chipId (should just be a signature of the commitBlock)
     */
    function setOwner(
        address _chipId,
        address _newOwner,
        uint256 _commitBlock,
        bytes calldata _signature
    )
        public
        override
    {   
        // Validations happen in ClaimedPBT, ERC721 doesn't allow transfers to the zero address
        ClaimedPBT.setOwner(_chipId, _newOwner, _commitBlock, _signature);
        _setERSOwnerForChip(_chipId, _newOwner);
    }

    /* ============ External Admin Functions ============ */

    /**
     * @notice ONLY OWNER: Initialize ChipRegistry contract with ERS and Services Registry addresses. Required due to order of operations
     * during deploy.
     *
     * @param _ers                       Address of the ERS contract
     * @param _servicesRegistry          Address of the ServicesRegistry contract
     * @param _developerRegistry               Address of the DeveloperRegistry contract
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
     * @notice ONLY OWNER: Add a new gateway URL to the array of gateway URLs. This array returns different URLs the client can call to
     * get the data to resolve an unclaimed chip. The client can then use the data returned from the URL to call resolveUnclaimedChip.
     *
     * @param _gatewayUrl       The URL to add to the array of gateway URLs
     */
    function addGatewayURL(string memory _gatewayUrl) external onlyOwner {
        require(!gatewayUrls.contains(_gatewayUrl), "Gateway URL already added");

        gatewayUrls.push(_gatewayUrl);
        emit GatewayURLAdded(_gatewayUrl);
    }

    /**
     * @notice ONLY OWNER: Remove a gateway URL from the array of gateway URLs. This array returns different URLs the client can call to
     * get the data to resolve an unclaimed chip. The client can then use the data returned from the URL to call resolveUnclaimedChip.
     *
     * @param _gatewayUrl       The URL to remove from the array of gateway URLs
     */
    function removeGatewayURL(string memory _gatewayUrl) external onlyOwner {
        require(gatewayUrls.contains(_gatewayUrl), "Gateway URL not in array");

        gatewayUrls.removeStorage(_gatewayUrl);
        emit GatewayURLRemoved(_gatewayUrl);
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
     * @notice Resolve chip following EIP-3668 conventions. If the chip has been claimed, return the primary service content.
     * If the chip hasn't been claimed then revert with an OffchainLookup error (per EIP-3668). The client can read the error
     * and use the contents to find the required information to submit to the resolveUnclaimedChip function. This function will
     * then return the either a bootloader app or content associated with the chip depending on if it has been included in a
     * project enrollment.
     *
     * @param _chipId           The chip public key
     * @return                  The content associated with the chip (if chip has been claimed already)
     */
    function resolveChipId(address _chipId) external view returns (IServicesRegistry.Record[] memory) {
        if (_exists(_chipId)) {
            return servicesRegistry.getPrimaryServiceContent(_chipId);
        } else {
            revert OffchainLookup(
                address(this),
                gatewayUrls,
                abi.encodePacked(_chipId),
                this.resolveUnclaimedChip.selector,
                abi.encode(_chipId)
            );
        }
    }

    /**
     * @notice Callback function for resolving unclaimed chip following EIP-3668 conventions. If the chip has been enrolled in
     * a project and has valid certificates then return the claim app for that project. Otherwise, get the bootloader app associated
     *  with the chip from the ManufacturerRegistry and return that. The _response parameter is structured in the following way:
     * | developerEntries (uint256) | data (bytes) | where data is structured as follows:
     * | [developerEntry[0],..., developerEntry[n], manufacturerValidation] | where developerEntry is structured as follows:
     * | enrollmentId (bytes32) | projectRegistrar (address) | DeveloperMerkleInfo | developerInclusionProof | custodyProof
     *
     * @param _response         The response from the offchain lookup
     * @param _extraData        Extra data required to resolve the unclaimed chip
     * @return                  The bootloader app or content associated with the chip
     */
    function resolveUnclaimedChip(
        bytes calldata _response,
        bytes calldata _extraData
    )
        external
        view
        returns(IServicesRegistry.Record[] memory)
    {   
        address chipId = abi.decode(_extraData, (address));

        if(_exists(chipId)) {
            return servicesRegistry.getPrimaryServiceContent(chipId);
        }

        (
            uint8 developerEntries,
            bytes[] memory entries
        ) = abi.decode(_response, (uint8, bytes[]));
        uint8 entryLength = uint8(entries.length);

        // Check that the response at least has a manufacturerValidation entry
        require(entryLength == developerEntries + 1, "Invalid response length");

        // Cycle through Developer entries and check if any are valid, return first valid entry. If there is no valid Developer entry then
        // check the manufacturerValidation entry and return bootloader app. Most likely reason for a malicious invalid entry
        // is not being able to create valid developerCustodyProof.
        if (developerEntries > 0) {
            for (uint8 i = 0; i < entryLength - 1; ++i) {
                (
                    bytes32 enrollmentId,
                    IProjectRegistrar projectRegistrar,
                    DeveloperMerkleInfo memory developerMerkleInfo,
                    bytes memory developerInclusionProof,
                    bytes memory developerCustodyProof
                ) = abi.decode(entries[i], (bytes32, IProjectRegistrar, DeveloperMerkleInfo, bytes, bytes));

                (bool validCertificates, ) = _areValidCertificates(
                    chipId,
                    projectEnrollments[projectRegistrar].projectPublicKey,
                    developerInclusionProof,
                    developerCustodyProof
                );

                bool validProof = _isValidDeveloperMerkleProof(
                    chipId,
                    developerMerkleInfo,
                    enrollmentId,
                    projectEnrollments[projectRegistrar].merkleRoot
                );
                if (validProof && validCertificates) {
                    return servicesRegistry.getServiceContent(chipId, developerMerkleInfo.serviceId);
                }
            }
        }
        // If no valid Developer entries then we know the chip is not enrolled in a project and we can return the bootloader app
        ManufacturerValidation memory manufacturerValidation = abi.decode(entries[entryLength - 1], (ManufacturerValidation));

        _validateManufacturerMerkleProof(chipId, manufacturerValidation);

        IServicesRegistry.Record[] memory bootloaderResponse = new IServicesRegistry.Record[](1);
        bootloaderResponse[0] = IServicesRegistry.Record({
            recordType: REDIRECT_URL_RECORDTYPE,
            content: bytes(manufacturerRegistry.getEnrollmentBootloaderApp(manufacturerValidation.enrollmentId))
        });

        return bootloaderResponse;
    }

    /**
     * @notice Get tokenUri from tokenId. TokenURI associated with primary service takes precedence, if no tokenURI as
     * part of primary service then fail over to tokenURI defined in ClaimedPBT.
     *
     * @param _tokenId          Chip's tokenId
     * @return                  TokenUri
     */
    function tokenURI(uint256 _tokenId) public view override(ClaimedPBT, IERC721Metadata) returns (string memory) {
        string memory tokenUri = _getChipPrimaryServiceContentByRecordType(tokenIdToChipId[_tokenId], URI_RECORDTYPE);
        return bytes(tokenUri).length == 0 ? ClaimedPBT.tokenURI(_tokenId) : tokenUri;
    }

    /**
     * @notice Get tokenUri from chip address. TokenURI associated with primary service takes precedence, if no tokenURI as
     * part of primary service then fail over to tokenURI defined in ClaimedPBT.
     *
     * @param _chipId           Chip's address
     * @return                  TokenUri
     */
    function tokenURI(address _chipId) public view override returns (string memory) {
        string memory tokenUri = _getChipPrimaryServiceContentByRecordType(_chipId, URI_RECORDTYPE);
        return bytes(tokenUri).length == 0 ? ClaimedPBT.tokenURI(_chipId) : tokenUri;
    }

    function getGatewayUrls() external view returns(string[] memory) {
        return gatewayUrls;
    }

    /* ============ Internal Functions ============ */

    /**
     * Get ERS node from tokenData and then sets the new Owner of the chip on the ERSRegistry.
     */
    function _setERSOwnerForChip(address _chipId, address _newOwner) internal {
        (bytes32 chipErsNode, ) = _decodeTokenData(chipTable[_chipId].tokenData);
        ers.setNodeOwner(chipErsNode, _newOwner);
    }

    /**
     * Check that certificates passed as part of claim are valid. Developer cert is valid if the project public key signed
     * the address of the chip. We then check the validity of the signed certificate which is the project public key
     * signed by the chip.
     */
    function _validateCertificates(
        address _chipId,
        address _projectPublicKey,
        bytes memory _developerInclusionProof,
        bytes memory _developerCustodyProof
    )
        internal
        view
    {
        (bool validCertificates, string memory errorMessage) = _areValidCertificates(
            _chipId,
            _projectPublicKey,
            _developerInclusionProof,
            _developerCustodyProof
        );

        require(validCertificates, errorMessage);
    }

    /**
     * Check that certificates passed as part of claim are valid. Developer cert is valid if the project public key signed
     * the address of the chip. We then check the validity of the signed certificate which is the project public key
     * signed by the chip. If one of the certificates is invalid we return false and bubble up the error message.
     *
     * @return  bool    Whether or not the certificates are valid
     * @return  string  Error message if certificates are invalid
     */
    function _areValidCertificates(
        address _chipId,
        address _projectPublicKey,
        bytes memory _developerInclusionProof,
        bytes memory _developerCustodyProof
    )
        internal
        view
        returns (bool, string memory)
    {
        // .toEthSignedMessageHash() prepends the message with "\x19Ethereum Signed Message:\n" + message.length and hashes message
        bytes32 developerInclusionProofHash = abi.encodePacked(_chipId).toEthSignedMessageHash();
        bytes32 signedCertHash = abi.encodePacked(_projectPublicKey).toEthSignedMessageHash();

        if (!_projectPublicKey.isValidSignatureNow(developerInclusionProofHash, _developerInclusionProof)) {
            return (false, "Invalid Developer certificate");
        } else if (!_chipId.isValidSignatureNow(signedCertHash, _developerCustodyProof)) {
            return (false, "Invalid custody proof");
        } else {
            return (true, "");
        }
    }

    /**
     * Validate inclusion in Manufacturer's chip enrollment
     */
    function _validateManufacturerMerkleProof(
        address chipId,
        ManufacturerValidation memory _manufacturerValidation
    )
        internal
        view
    {
        bool isEnrolledChip = manufacturerRegistry.isEnrolledChip(
            _manufacturerValidation.enrollmentId,
            _manufacturerValidation.mIndex,
            chipId,
            _manufacturerValidation.manufacturerProof
        );
        require(isEnrolledChip, "Chip not enrolled with ManufacturerRegistry");
    }

    /**
     * Indicate inclusion in Developer's merkle tree
     */
    function _isValidDeveloperMerkleProof(
        address _chipId,
        DeveloperMerkleInfo memory _merkleProofInfo,
        bytes32 _enrollmentId,
        bytes32 _merkleRoot
    )
        internal
        pure
        returns (bool)
    {
        bytes32 node = keccak256(
            bytes.concat(keccak256(
                abi.encode(
                    _merkleProofInfo.developerIndex,
                    _chipId,
                    _enrollmentId,
                    _merkleProofInfo.lockinPeriod,
                    _merkleProofInfo.serviceId,
                    _merkleProofInfo.tokenUri
                )
            ))
        );

        return MerkleProof.verify(_merkleProofInfo.developerProof, _merkleRoot, node);
    }

    /**
     * Validate inclusion in Developer's merkle tree
     */
    function _validateDeveloperMerkleProof(
        address _chipId,
        DeveloperMerkleInfo memory _merkleProofInfo,
        bytes32 _enrollmentId,
        bytes32 _merkleRoot
    )
        internal
        pure
    {
        require(_isValidDeveloperMerkleProof(_chipId, _merkleProofInfo, _enrollmentId, _merkleRoot), "Invalid Developer merkle proof");
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

    /**
     * ClaimedPBT has an unstructured "tokenData" field that for our implementation we will populate with the chip's
     * ERS node and the manufacturer enrollmentId of the chip. This function structures that data.
     */
    function _encodeTokenData(bytes32 _ersNode, bytes32 _enrollmentId) internal pure returns (bytes memory) {
        // Since no addresses there's no difference between abi.encode and abi.encodePacked
        return abi.encode(_ersNode, _enrollmentId);
    }

    /**
     * ClaimedPBT has an unstructured "tokenData" field that for our implementation we will populate with the chip's
     * ERS node and the manufacturer enrollmentId of the chip. This function interprets that data.
     */
    function _decodeTokenData(bytes memory _tokenData) internal pure returns (bytes32, bytes32) {
        return abi.decode(_tokenData, (bytes32, bytes32));
    }
}
