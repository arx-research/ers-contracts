//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IServicesRegistry {
    struct Record {
        bytes32 recordType;
        bytes content;
    }

    struct Service {
        bytes32 serviceId;
        Record[] records;
    }

    struct ExpandedChipServices {
        Service primaryService;
        uint256 serviceTimelock;
        Service[] secondaryServices;
    }

    function setInitialService(address _chipId, bytes32 _serviceId, uint256 _timelock) external;
    function getPrimaryServiceContentByRecordtype(address _chipId, bytes32 _datatype) external view returns (bytes memory);
    function getPrimaryServiceContent(address _chipId) external view returns (Record[] memory);
    function getServiceContent(address _chipId, bytes32 _serviceId) external view returns (Record[] memory);
    function isService(bytes32 _serviceId) external view returns (bool);
}
