//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

library ChipValidations {
    using SignatureChecker for address;
    using ECDSA for bytes;

    function validateSignatureAndExpiration(
        address _chipId,
        uint256 _commitBlock,
        uint256 _maxBlockWindow,
        bytes memory _payload,
        bytes memory _signature
    )
        internal
        view
    {
        require(_chipId.isValidSignatureNow(_payload.toEthSignedMessageHash(), _signature), "Invalid signature");

        // Check that the signature was generated within the maxBlockWindow
        require(block.number <= _commitBlock + _maxBlockWindow, "Signature expired");
    }
}
