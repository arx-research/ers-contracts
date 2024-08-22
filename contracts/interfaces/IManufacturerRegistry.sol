//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IManufacturerRegistry {
    function isEnrolledChip(
        bytes32 _enrollmentId,
        address _chipId,
        bytes calldata _manufacturerCertificate,
        bytes calldata _payload     
    )
        external
        view
        returns (bool);

    function isValidEnrollment (
        bytes32 _enrollmentId
    )
        external
        view
        returns (bool);

    function getEnrollmentBootloaderApp(bytes32 _enrollmentId) external view returns (string memory);
}
