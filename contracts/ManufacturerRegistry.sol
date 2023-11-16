//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ManufacturerRegistry
 * @author Arx
 *
 * @notice Registry for tracking and maintaining relevant info for Manufacturers. In order to make chips valid for the
 * protocol, manufacturers must register their chips in enrollments. Each enrollment will be assigned an id, which
 * must be referenced when adding chips to the registry. Enrollments have a merkle root of all chipIds (addresses)
 * that are valid for the enrollment. Manufacturer's can be found in three states:
 * 1. Unregistered: manufacturers[_manufacturerId].registered = false. This is the default state for all manufacturers.
 * 2. Registered: manufacturers[_manufacturerId].registered = true && manufacturers[_manufacturerId].owner != address(0).
 * 3. Read-only: manufacturers[_manufacturerId].registered = true && manufacturers[_manufacturerId].owner == address(0).
 *    Once a manufacturerId has been put in this state it CANNOT leave it.
 */
contract ManufacturerRegistry is Ownable {
    
    /* ============ Events ============ */
    event ManufacturerAdded(                // Called in addManufacturer
        bytes32 indexed manufacturerId,
        address owner
    );
    event ManufacturerRemoved(              // Called in removeManufacturer
        bytes32 indexed manufacturerId
    );

    event EnrollmentAdded(                  // Called in addChipEnrollment
        bytes32 indexed manufacturerId,     // Manufacturer identifier
        bytes32 indexed enrollmentId,       // Enrollment identifier
        bytes32 merkleRoot,                 // Merkle root of all chipIds (addresses) that are valid for this enrollment
        address manufacturerCertSigner,     // Address of certificate signer for this enrollment
        address authModel,                  // Address of contract that implements example signature validation for a chip
        string chipValidationDataUri,       // URI pointing to location of off-chain data required to validate chip is part of manufacturer enrollment
        string bootloaderApp,               // Bootloader app for this enrollment
        string chipModel                    // Chip model for this enrollment
    );

    event ManufacturerOwnerUpdated(         // Called in updateManufacturerOwner
        bytes32 indexed manufacturerId,
        address newOwner
    );

    /* ============ Structs ============ */
    struct EnrollmentInfo {
        uint256 manufacturerId;
        bytes32 merkleRoot;
        address manufacturerCertSigner;
        address authModel;                  // Address with implementation for validating chip signatures
        string chipValidationDataUri;       // URI pointing to location of off-chain data required to validate chip is part of manufacturer enrollment
        string bootloaderApp;
        string chipModel;                   // Description of chip
    }

    struct ManufacturerInfo {
        address owner;                      // Address that has ability to add enrollments for this manufacturer; turning off access is done by
                                            // setting owner to 0 address
        bool registered;                    // If manufacturer is registered, manufacturers cannot be unregistered in order to keep history,
                                            // burn access by setting owner to 0 address
        bytes32[] enrollments;
        uint256 nonce;                      // Nonce for manufacturer, incremented after each new enrollment by manufacturer
    }

    /* ============ Modifiers ============ */
    modifier onlyManufacturer(bytes32 _manufacturerId) {
        require(manufacturers[_manufacturerId].owner == msg.sender, "Only manufacturer can call this function");
        _;
    }

    /* ============ State Variables ============ */
    mapping(bytes32 => EnrollmentInfo) internal enrollments;
    mapping(bytes32 => ManufacturerInfo) internal manufacturers;
    
    /* ============ Constructor ============ */
    /**
     * @dev Constructor for ManufacturerRegistry. Sets owner to governance address.
     *
     * @param _governance               Address of governance
     */
    constructor(address _governance) Ownable() {
        transferOwnership(_governance);
    }

    /* ============ External Functions ============ */

    /**
     * @dev ONLY MANUFACTURER: Adds a new enrollment for an active manufacturer. Enrollment is assigned an id which is returned. Only owner address
     * associated with _manufacturerId can call this function. An "active" manufacturer is one with registered=true and a non-zero owner address.
     *
     * @param _manufacturerId               Bytes32 identifier for manufacturer (i.e. could be hash of manufacturer name)
     * @param _merkleRoot                   Merkle root of all chipIds (addresses) that are valid for this enrollment
     * @param _certSigner                   Address of certificate signer for this enrollment
     * @param _authModel                    Address of contract that implements example signature validation for a chip
     * @param _chipValidationDataUri        URI pointing to location of off-chain data required to validate chip is part of manufacturer enrollment
     * @param _bootloaderApp                Bootloader app for this enrollment
     * @param _chipModel                    Chip model for this enrollment
     * @return enrollmentId                 Id of enrollment
     */
    function addChipEnrollment(
        bytes32 _manufacturerId,
        bytes32 _merkleRoot,
        address _certSigner,
        address _authModel,
        string calldata _chipValidationDataUri,
        string calldata _bootloaderApp,
        string calldata _chipModel
    ) 
        external
        onlyManufacturer(_manufacturerId)
        returns (bytes32 enrollmentId)
    {
        require(_certSigner != address(0), "Invalid certificate signer address");
        require(_authModel != address(0), "Invalid auth model address");

        enrollmentId = keccak256(abi.encodePacked(_manufacturerId, manufacturers[_manufacturerId].nonce));

        enrollments[enrollmentId] = EnrollmentInfo({
            manufacturerId: uint256(_manufacturerId),
            merkleRoot: _merkleRoot,
            manufacturerCertSigner: _certSigner,
            authModel: _authModel,
            chipValidationDataUri: _chipValidationDataUri,
            bootloaderApp: _bootloaderApp,
            chipModel: _chipModel
        });

        manufacturers[_manufacturerId].enrollments.push(enrollmentId);
        manufacturers[_manufacturerId].nonce++;

        emit EnrollmentAdded(
            _manufacturerId,
            enrollmentId,
            _merkleRoot,
            _certSigner,
            _authModel,
            _chipValidationDataUri,
            _bootloaderApp,
            _chipModel
        );
    }

    /**
     * @dev ONLY OWNER: Registers a new manufacturer. Manufacturer is marked as registered forever once added so that history can't be mixed with
     * other manufacturers. To burn access the owner param is set to the zero address (in removeManufacturer). A manufacturer is considered "new"
     * if registered=false.
     *
     * @param _manufacturerId           Bytes32 identifier for manufacturer (i.e. could be hash of manufacturer name)
     * @param _owner                    Address of Perp Vault contract
     */
    function addManufacturer(bytes32 _manufacturerId, address _owner) external onlyOwner {
        require(!manufacturers[_manufacturerId].registered, "Manufacturer already registered");
        require(_owner != address(0), "Invalid owner address");

        manufacturers[_manufacturerId].owner = _owner;
        manufacturers[_manufacturerId].registered = true;

        emit ManufacturerAdded(_manufacturerId, _owner);
    }

    /**
     * @dev ONLY OWNER: Removes an active manufacturer putting their history in read-only mode. In order to remove access we burn the owner key,
     * this prevents history from being mixed in case a new manufacturer accidentally wants to use an old ID (it would revert and they would
     * need to choose an new ID).
     *
     * @param _manufacturerId           Bytes32 identifier for manufacturer (i.e. could be hash of manufacturer name)
     */
    function removeManufacturer(bytes32 _manufacturerId) external onlyOwner {
        require(manufacturers[_manufacturerId].owner != address(0), "Manufacturer not registered");

        // We don't change registered to false in order to make sure that the manufacturer name is not reused, thus mixing history
        delete manufacturers[_manufacturerId].owner;

        emit ManufacturerRemoved(_manufacturerId);
    }

    /**
     * @dev ONLY MANUFACTURER: Updates the owner address for a manufacturer. Only owner address associated with _manufacturerId can call this
     * function.
     *
     * @param _manufacturerId           Bytes32 identifier for manufacturer (i.e. could be hash of manufacturer name)
     * @param _newOwner                 Address of new owner
     */
    function updateManufacturerOwner(bytes32 _manufacturerId, address _newOwner) external onlyManufacturer(_manufacturerId) {
        require(_newOwner != address(0), "Invalid owner address");

        manufacturers[_manufacturerId].owner = _newOwner;
        emit ManufacturerOwnerUpdated(_manufacturerId, _newOwner);
    }

    /* ============ View Functions ============ */

    /**
     @dev Validate that _chipId is included in the merkle tree for _enrollmentId.

     * @param _enrollmentId         bytes32 identifier of the manaufacturer enrollment
     * @param _index                Index of enrollment in the merkle tree
     * @param _chipId               Public key associated with the chip
     * @param _merkleProof          Merkle Proof for _chipId's inclusion in _enrollmentId
     */
    function isEnrolledChip(
        bytes32 _enrollmentId,
        uint256 _index,
        address _chipId,
        bytes32[] calldata _merkleProof
    )
        external
        view
        returns (bool)
    {
        bytes32 enrollmentMerkleRoot = enrollments[_enrollmentId].merkleRoot;
        bytes32 node = keccak256(abi.encodePacked(_index, _chipId));

        return MerkleProof.verify(_merkleProof, enrollmentMerkleRoot, node);
    }

    function getManufacturerInfo(bytes32 _manufacturerId) external view returns (ManufacturerInfo memory) {
        return manufacturers[_manufacturerId];
    }

    function getEnrollmentInfo(bytes32 _enrollmentId) public view returns (EnrollmentInfo memory) {
        return enrollments[_enrollmentId];
    }

    function getEnrollmentBootloaderApp(bytes32 _enrollmentId) external view returns (string memory) {
        return getEnrollmentInfo(_enrollmentId).bootloaderApp;
    }
}
