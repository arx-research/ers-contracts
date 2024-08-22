//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { IEnrollmentAuthModel } from "../../interfaces/IEnrollmentAuthModel.sol";

/**
 * @title EnrollmentEIP191Model
 * @author Arx
 *
 * @notice Enrollment Auth model contract that encodes an implementation of the curve used to sign manufacturer 
 * enrollment messages.
 */
contract EnrollmentEIP191Model is IEnrollmentAuthModel {

    using SignatureChecker for address;
    using ECDSA for bytes;
 
    constructor() {}

    /**
     * @notice Verifies a signature against a message and signer address
     * @param _chipId The address of the chip
     * @param _manufacturerCertSigner The address of the signer
     * @param _manufacturerCertificate The manufacturer certificate
     * Optional: Additional payload if required for authnetication; optional
     */
    function verifyManufacturerCertificate(
        address _chipId,
        address _manufacturerCertSigner,
        bytes calldata _manufacturerCertificate,
        bytes calldata
    )
        external
        view
        returns (bool)
    {
        bytes32 messageHash = abi.encodePacked(_chipId).toEthSignedMessageHash();
        return _manufacturerCertSigner.isValidSignatureNow(messageHash, _manufacturerCertificate);
    }
}
