//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IEnrollmentAuthModel {
    function verifyManufacturerCertificate(
        address chipId,
        address manufacturerCertSigner,
        bytes calldata manufacturerCertificate,
        bytes calldata payload
    ) external view returns (bool);
}
