//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { Bytes32ArrayUtils } from "./lib/Bytes32ArrayUtils.sol"; 
import { ChipValidations } from "./lib/ChipValidations.sol";
import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IServicesRegistry } from "./interfaces/IServicesRegistry.sol";

/**
 * @title ServicesRegistry
 * @author Arx Research
 *
 * @notice Contract for creating and updating services for service owners and adding/removing services for chip owners. Services
 * contain a recordType and record content. The recordType is intended to be a standardized off-chain string that clients
 * can use to interpret the record content. Record types could be a tokenUri, a URL, a smart contract, or any other value.
 * Chips are always enrolled in a primary service, in most cases this is the service the chip should resolve to when
 * scanned. Additionally, a chip can be enrolled in secondary services that allow it to access additional functionality.
 * Primary services have a timelock that must expire before the primary service can be changed. Secondary services can be
 * added and removed at any time. The primary service cannot be one of the chip's secondary services.
 */
contract ServicesRegistry is IServicesRegistry {
    using Bytes32ArrayUtils for bytes32[];
    using ChipValidations for address;
    using ECDSA for bytes;

    /* ============ Events ============ */

    event ServiceCreated(bytes32 indexed serviceId, address indexed owner);
    event ServiceRecordAdded(bytes32 indexed serviceId, bytes32 indexed recordType, bytes content, bool appendId);
    event ServiceRecordEdited(bytes32 indexed serviceId, bytes32 indexed recordType, bytes newContent, bool appendId);
    event ServiceRecordRemoved(bytes32 indexed serviceId, bytes32 indexed recordType);
    event ServiceOwnershipTransferred(bytes32 indexed serviceId, address oldOwner, address newOwner);

    event PrimaryServiceUpdated(
        address indexed chipId,
        bytes32 indexed newPrimaryService,
        bytes32 oldPrimaryService,
        uint256 serviceTimelock
    );
    event SecondaryServiceAdded(address indexed chipId, bytes32 indexed serviceId);
    event SecondaryServiceRemoved(address indexed chipId, bytes32 indexed serviceId);

    /* ============ Structs ============ */

    struct RecordContent {
        bool enabled;                   // Need to have an enabled flag because we can't rely on the content field containing info
        bool appendId;                  // Indicates whether _chipId should be appended to end of the record content
        bytes content;
    }

    struct ServiceRecord {
        bytes32 recordType;
        bytes content;
        bool appendId;                  // Indicates whether _chipId should be appended to end of the record content
    }

    struct ServiceInfo {
        address owner;
        bytes32[] recordTypes;
    }

    struct ChipServices {
        bytes32 primaryService;
        uint256 serviceTimelock;        // Timelock before which the primaryService cannot be changed
        bytes32[] secondaryServices;
    }

    /* ============ Modifiers ============ */

    modifier onlyServiceOwner(bytes32 _serviceId) {
        require(serviceInfo[_serviceId].owner == msg.sender, "Caller must be service owner");
        _;
    }

    modifier onlyChipOwner(address _chipId) {
        require(chipRegistry.ownerOf(_chipId) == msg.sender, "Caller must be chip owner");
        _;
    }

    /* ============ State Variables ============ */

    IChipRegistry public immutable chipRegistry;
    uint256 public immutable maxBlockWindow;

    mapping(address=>ChipServices) public chipServices;
    mapping(address=>mapping(bytes32=>bool)) public enrolledServices;
    mapping(bytes32=>ServiceInfo) public serviceInfo;
    mapping(bytes32=>mapping(bytes32=>RecordContent)) public serviceRecords;

    /* ============ Constructor ============ */

    /**
     * @notice Constructor for ServicesRegistry
     *
     * @param _chipRegistry         Address of the ChipRegistry contract
     * @param _maxBlockWindow       The maximum amount of blocks a signature used for updating chip table is valid for
    */
    constructor(IChipRegistry _chipRegistry, uint256 _maxBlockWindow) {
        chipRegistry = _chipRegistry;
        maxBlockWindow = _maxBlockWindow;
    }

    /* ============ External Functions ============ */

    /**
     * @notice Creates a new service. Services contain multiple different record types which could be a tokenUri, a URL or any other
     * unstructured content. Each record is identified by its recordType. We expect off-chain standardization around recordTypes and
     * do not maintain a canonical on-chain list of records. Associated with each recordType is a content string which is intended
     * to be interpreted by the client. The service ID must be unique and the service records must not contain duplicate record types.
     *
     * @param _serviceId        The service ID
     * @param _serviceRecords   The service records
     */
    function createService(bytes32 _serviceId, ServiceRecord[] calldata _serviceRecords) external {
        require(_serviceId != bytes32(0), "Invalid ServiceId");
        require(!_isService(_serviceId), "ServiceId already taken");

        serviceInfo[_serviceId].owner = msg.sender;

        for (uint256 i = 0; i < _serviceRecords.length; ++i) {
            _addServiceRecord(_serviceId, _serviceRecords[i]);
        }

        emit ServiceCreated(_serviceId, msg.sender);
    }

    /**
     * @notice ONLY SERVICE OWNER: Adds new service records to an existing service. The service records must not contain duplicate record types or
     * have an existing record of the same type. Don't need to explicitly check that the service has been created because if it has then there
     * should be an owner address if not then the owner address is the zero address thus it will revert.
     *
     * @param _serviceId        The service ID
     * @param _serviceRecords   The service records
     */
    function addServiceRecords(bytes32 _serviceId, ServiceRecord[] calldata _serviceRecords) external onlyServiceOwner(_serviceId) {
        for (uint256 i = 0; i < _serviceRecords.length; ++i) {
            _addServiceRecord(_serviceId, _serviceRecords[i]);
        }
    }

    /**
     * @notice ONLY SERVICE OWNER: Edits existing service records for an existing service. The service records must not contain duplicate record
     * types.
     *
     * @param _serviceId        The service ID
     * @param _serviceRecords   The service records
     */
    function editServiceRecords(bytes32 _serviceId, ServiceRecord[] calldata _serviceRecords) external onlyServiceOwner(_serviceId) {
        bytes32[] memory recordTypes = new bytes32[](_serviceRecords.length);   // Need to do duplication check so need to store in memory

        mapping(bytes32=>RecordContent) storage record = serviceRecords[_serviceId];
        for (uint256 i = 0; i < _serviceRecords.length; ++i) {
            // Split up the fields because it saves some gas (~100 per record)
            bytes32 recordType = _serviceRecords[i].recordType;
            bytes memory content = _serviceRecords[i].content;
            bool appendId = _serviceRecords[i].appendId;

            require(record[recordType].enabled, "Record type does not exist for service");

            record[recordType].content = content;
            record[recordType].appendId = appendId;
            recordTypes[i] = recordType;

            emit ServiceRecordEdited(_serviceId, recordType, content, appendId);
        }

        require(!recordTypes.hasDuplicate(), "Duplicate record types");
    }

    /**
     * @notice ONLY SERVICE OWNER: Removes existing service records for an existing service. The service records must not contain duplicate record
     * types.
     *
     * @param _serviceId        The service ID
     * @param _recordTypes      The record types to remove
     */
    function removeServiceRecords(bytes32 _serviceId, bytes32[] calldata _recordTypes) external onlyServiceOwner(_serviceId) {
        mapping(bytes32=>RecordContent) storage record = serviceRecords[_serviceId];
        for (uint256 i = 0; i < _recordTypes.length; ++i) {
            bytes32 recordType = _recordTypes[i];

            // Case covers if record didn't exist before function call or was deleted during function call
            require(record[recordType].enabled, "Record type does not exist for service");

            serviceInfo[_serviceId].recordTypes.removeStorage(recordType);

            delete record[recordType];

            emit ServiceRecordRemoved(_serviceId, recordType);
        }
    }

    /**
     * @notice ONLY SERVICE OWNER: Sets the service owner to a new address. The new address cannot be the zero address.
     *
     * @param _serviceId        The service ID
     * @param _newOwner         The new owner address
     */
    function setServiceOwner(bytes32 _serviceId, address _newOwner) external onlyServiceOwner(_serviceId) {
        require(_newOwner != address(0), "Invalid address");
        require(msg.sender != _newOwner, "Old and new owner are same address");     // Checked that msg.sender == oldOwner in modifier

        address oldOwner = serviceInfo[_serviceId].owner;

        serviceInfo[_serviceId].owner = _newOwner;

        emit ServiceOwnershipTransferred(_serviceId, oldOwner, _newOwner);
    }

    /**
     * @notice ONLY CHIP REGISTRY: Sets the initial service for a chip. The service must exist and the passed _timelock must not be 0. If the
     * current primaryService state is set to bytes32(0) then the chip has NOT been enrolled in a service and thus this function can be called. 
     *
     * @param _chipId           The chip ID
     * @param _serviceId        The service ID to enroll
     * @param _timelock         Timestamp before which the primaryService cannot be changed
     */
    function setInitialService(
        address _chipId,
        bytes32 _serviceId,
        uint256 _timelock
    )
        external
        override
    {
        require(msg.sender == address(chipRegistry), "Caller must be ChipRegistry");

        // NOTE: we don't want to check that the _timelock is greater than the current timestamp in case the claim happens after timelock expires
        require(_timelock != 0, "Timelock cannot be set to 0");
        require(chipServices[_chipId].primaryService == bytes32(0), "Primary service already set");
        // Covers case where _serviceId == bytes32(0) since that can't be a service per createService
        require(_isService(_serviceId), "Service does not exist");
        // chipServices[_chipId].primaryService = _serviceId;
        // chipServices[_chipId].secondaryServices = new bytes32[](0);

        chipServices[_chipId] = ChipServices({
            primaryService: _serviceId,
            serviceTimelock: _timelock,
            secondaryServices: new bytes32[](0)
        });

        emit PrimaryServiceUpdated(_chipId, _serviceId, bytes32(0), _timelock);
    }

    /**
     * @notice ONLY CHIP OWNER: Sets the primary service for the calling chip. In order for this function to succeed the following conditions
     * must be met:
     *  - The caller is the chip owner
     *  - The new service must exist
     *  - The new service must not be the same as the current primary service
     *  - The new timelock must be greater than the current block timestamp
     *  - The timelock for the previous primaryService must have expired
     *  - The new service must not be enrolled as a secondary service for the chip
     *  - The signature was generated by the chip
     * This function can't be called until after the chip has been claimed and enrolled in a primary service (enforced by onlyChipOwner).
     *
     * @param _chipId           Address of chip removing secondary service
     * @param _serviceId        New primary service ID
     * @param _newTimelock      Timelock for the new primary service
     * @param _commitBlock      The block the signature is tied to (used to put a time limit on the signature)
     * @param _signature        The signature generated by the chipId (should just be a signature of the commitBlock)
     */
    function setNewPrimaryService(
        address _chipId,
        bytes32 _serviceId,
        uint256 _newTimelock,
        uint256 _commitBlock,
        bytes calldata _signature
    )
        external
        onlyChipOwner(_chipId)
    {
        bytes32 oldPrimaryService = chipServices[_chipId].primaryService;

        require(chipServices[_chipId].serviceTimelock < block.timestamp, "Timelock has not expired");
        require(_newTimelock > block.timestamp, "Timelock must be greater than current timestamp");

        // Covers case where _serviceId == bytes32(0) since that can't be a service per createService
        require(_isService(_serviceId), "Service does not exist");
        require(!enrolledServices[_chipId][_serviceId], "Primary service cannot be secondary service");
        require(_serviceId != oldPrimaryService, "Service already set as primary service");

        bytes memory payload = abi.encodePacked(_commitBlock, _serviceId, _newTimelock);
        _chipId.validateSignatureAndExpiration(
            _commitBlock,
            maxBlockWindow,
            payload,
            _signature
        );

        chipServices[_chipId].primaryService = _serviceId;
        chipServices[_chipId].serviceTimelock = _newTimelock;

        emit PrimaryServiceUpdated(_chipId, _serviceId, oldPrimaryService, _newTimelock);
    }

    /**
     * @notice ONLY CHIP OWNER: Adds a secondary service for the calling chip. In order for this function to succeed the following conditions
     * must be met:
     *  - The caller is the chip owner
     *  - The new service must exist
     *  - The new service must not be enrolled as a secondary service for the chip
     *  - The new service must not be the same as the primary service
     *  - The signature was generated by the chip
     * This function can't be called until after the chip has been claimed and enrolled in a primary service (enforced by onlyChipOwner).
     *
     * @param _chipId           Address of chip removing secondary service
     * @param _serviceId        The service ID
     * @param _commitBlock      The block the signature is tied to (used to put a time limit on the signature)
     * @param _signature        The signature generated by the chipId (should just be a signature of the commitBlock)
     */
    function addSecondaryService(
        address _chipId,
        bytes32 _serviceId,
        uint256 _commitBlock,
        bytes calldata _signature
    )
        external
        onlyChipOwner(_chipId)
    {
        require(_isService(_serviceId), "Service does not exist");
        require(!enrolledServices[_chipId][_serviceId], "Service already enrolled");
        require(_serviceId != chipServices[_chipId].primaryService, "Service already set as primary service");

        bytes memory payload = abi.encodePacked(_commitBlock, _serviceId);
        _chipId.validateSignatureAndExpiration(
            _commitBlock,
            maxBlockWindow,
            payload,
            _signature
        );

        chipServices[_chipId].secondaryServices.push(_serviceId);
        enrolledServices[_chipId][_serviceId] = true;

        emit SecondaryServiceAdded(_chipId, _serviceId);
    }

    /**
     * @notice ONLY CHIP OWNER: Removes a secondary service for the calling chip. In order for this function to succeed the following
     * conditions must be met:
     *  - The caller is the chip owner
     *  - The service must exist
     *  - The service must be enrolled as a secondary service for the chip
     *  - The signature was generated by the chip
     * This function can't be called until after the chip has been claimed and enrolled in a primary service (enforced by onlyChipOwner).
     *
     * @param _chipId           Address of chip removing secondary service
     * @param _serviceId        The service ID
     * @param _commitBlock      The block the signature is tied to (used to put a time limit on the signature)
     * @param _signature        The signature generated by the chipId (should just be a signature of the commitBlock)
     */
    function removeSecondaryService(
        address _chipId,
        bytes32 _serviceId,
        uint256 _commitBlock,
        bytes calldata _signature
    )
        external
        onlyChipOwner(_chipId)
    {
        require(_isService(_serviceId), "Service does not exist");
        require(enrolledServices[_chipId][_serviceId], "Service not enrolled");

        bytes memory payload = abi.encodePacked(_commitBlock, _serviceId);
        _chipId.validateSignatureAndExpiration(
            _commitBlock,
            maxBlockWindow,
            payload,
            _signature
        );

        chipServices[_chipId].secondaryServices.removeStorage(_serviceId);
        enrolledServices[_chipId][_serviceId] = false;

        emit SecondaryServiceRemoved(_chipId, _serviceId);
    }

    /* ============ View Functions ============ */

    /**
     * Return information about owner and record types for a service
     *
     * @param _serviceId        The service ID
     * @return                  ServiceInfo struct (owner and recordTypes)
     */
    function getServiceInfo(bytes32 _serviceId) external view returns (ServiceInfo memory) {
        return serviceInfo[_serviceId];
    }

    /**
     * Get the content of the given record type for a chip's primary service
     *
     * @param _chipId        The chip ID
     * @param _recordType    The record type
     * @return               bytes representing the content of the record
     */
    function getPrimaryServiceContentByRecordtype(
        address _chipId,
        bytes32 _recordType
    )
        external
        view
        override
        returns (bytes memory)
    {
        bytes32 primaryService = chipServices[_chipId].primaryService;
        RecordContent memory recordContent = serviceRecords[primaryService][_recordType];
        return _createContentString(_chipId, recordContent.content, recordContent.appendId);
    }

    /**
     * Get a list of all records for a given service
     *
     * @param _serviceId     The service ID
     * @return records       List of ServiceRecords for the passed serviceId
     */
    function getServiceContent(address _chipId, bytes32 _serviceId) public view returns (Record[] memory records) {
        bytes32[] memory recordTypes = serviceInfo[_serviceId].recordTypes;

        uint256 recordTypesLength = recordTypes.length;
        records = new Record[](recordTypesLength);
        for (uint256 i = 0; i < recordTypesLength; ++i) {
            bytes32 recordType = recordTypes[i];
            RecordContent memory serviceContent = serviceRecords[_serviceId][recordType];
            records[i] = Record({
                recordType: recordType,
                content: _createContentString(_chipId, serviceContent.content, serviceContent.appendId)
            });
        }
    }

    /**
     * Get records for every secondary service and primary service for a chip. Primary service timelock is also included
     * in struct.
     *
     * @param _chipId   The chip ID
     * @return          Struct containing all records for each secondary service and primary service for the chip
     */
    function getAllChipServiceData(address _chipId) external view returns (ExpandedChipServices memory) {
        bytes32 primaryService = chipServices[_chipId].primaryService;
        bytes32[] memory secondaryServices = getChipSecondaryServices(_chipId);

        uint256 servicesArrayLength = secondaryServices.length;
        Service[] memory services = new Service[](servicesArrayLength);
        for (uint256 i = 0; i < servicesArrayLength; ++i) {
            bytes32 serviceId = secondaryServices[i];
            Record[] memory records = getServiceContent(_chipId, serviceId);
            services[i] = Service({
                serviceId: serviceId,
                records: records
            });
        }

        return ExpandedChipServices({
            primaryService: Service({
                serviceId: primaryService,
                records: getServiceContent(_chipId, primaryService)
            }),
            serviceTimelock: chipServices[_chipId].serviceTimelock,
            secondaryServices: services
        });
    }

    /**
     * Get records for every secondary service and primary service for a chip. Primary service timelock is also included
     * in struct.
     *
     * @param _chipId   The chip ID
     * @return          List of ServiceRecords for the chip's primary service
     */
    function getPrimaryServiceContent(address _chipId) external view returns (Record[] memory) {
        bytes32 primaryService = chipServices[_chipId].primaryService;
        return getServiceContent(_chipId, primaryService);
    }

    /**
     * Get list of secondary service Id's for a chip
     *
     * @param _chipId   The chip ID
     * @return          List of secondary serviceIds for the chip
     */
    function getChipSecondaryServices(address _chipId) public view returns (bytes32[] memory) {
        return chipServices[_chipId].secondaryServices;
    }

    /* ============ Internal Functions ============ */

    /**
     * @notice Adds a new service record to an existing service. The service records must not contain duplicate record types or
     * have an existing record of the same type.
     *
     * @param _serviceId        The service ID
     * @param _record           ServiceRecord struct containing recordType, content, and appendId
     */
    function _addServiceRecord(bytes32 _serviceId, ServiceRecord calldata _record) internal {
        // Case covers if record was previously added before function call or during function call
        require(!serviceRecords[_serviceId][_record.recordType].enabled, "Record type already exists for service");

        serviceRecords[_serviceId][_record.recordType] = RecordContent({
            enabled: true,
            content: _record.content,
            appendId: _record.appendId
        });

        serviceInfo[_serviceId].recordTypes.push(_record.recordType);

        emit ServiceRecordAdded(_serviceId, _record.recordType, _record.content, _record.appendId);
    }

    /**
     * @notice Checks if a service exists
     *
     * @param _serviceId        The service ID
     * @return                  True if service exists, false otherwise
     */
    function _isService(bytes32 _serviceId) internal view returns (bool) {
        return serviceInfo[_serviceId].owner != address(0);
    }

    /**
     * @notice Build a content string based on if the chipId should be appended to the base content
     *
     * @param _chipId           The chip ID
     * @param _content          The base content
     * @param _appendId         Whether or not to append the chipId to the content
     * @return                  Bytestring representing the content
     */
    function _createContentString(address _chipId, bytes memory _content, bool _appendId) internal pure returns (bytes memory) {
        // Must convert to string first then to bytes otherwise interpreters will try to convert address to a utf8 string
        string memory stringChipId = Strings.toHexString(_chipId);
        return _appendId ? bytes.concat(_content, bytes(stringChipId)) : _content;
    }
}
