//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IManufacturerRegistry {
    // function isEnrolledChip(
    //     bytes32 _enrollmentId,
    //     uint256 _index,
    //     address _chipId,
    //     bytes32[] calldata _merkleProof
    // )
    //     external
    //     view
    //     returns (bool);


    function isEnrolledChip(
        bytes32 _enrollmentId,
        address _chipId,
        bytes calldata _chipCertificate        
    )
        external
        view
        returns (bool);

    function getEnrollmentBootloaderApp(bytes32 _enrollmentId) external view returns (string memory);
}
