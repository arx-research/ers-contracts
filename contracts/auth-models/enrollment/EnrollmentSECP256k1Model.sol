//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { IEnrollmentAuthModel } from "../../interfaces/IEnrollmentAuthModel.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title EnrollmentSECP256k1Model
 * @author Arx
 *
 * @notice Enrollment Auth model contract that encodes an implementation of the curve used to sign manufacturer 
 * enrollment messages.
 */
contract EnrollmentSECP256k1Model is EIP712, IEnrollmentAuthModel {

    using SignatureChecker for address;
    using ECDSA for bytes32;

    /* ============ Constants ============ */
    // Match signature version to project version.
    string public constant EIP712_SIGNATURE_DOMAIN = "ERS";
    string public constant EIP712_SIGNATURE_VERSION = "2.0.0";

    /* ============ Constructor ============ */
    /**
     * @dev Constructor for EnrollmentSECP256k1Model. Sets the owner and EIP712 domain.
     */   
    constructor() 
        EIP712(EIP712_SIGNATURE_DOMAIN, EIP712_SIGNATURE_VERSION) 
    {}

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
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("ManufacturerCertificate(address chipId)"),
            _chipId
        )));

        return _manufacturerCertSigner.isValidSignatureNow(digest, _manufacturerCertificate);
    }
}
