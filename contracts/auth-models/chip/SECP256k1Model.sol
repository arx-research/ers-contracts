//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title SECP256k1Model
 * @author Arx
 *
 * @notice Auth model contract that encodes an implementation of the curve used to sign chip messages. These
 * contracts are referred to by Manufacturer's when they enroll chips in the ManufacturerRegistry so that chip
 * holders know the curve used to sign messages from the chip. Chip holders can validate chip signatures against
 * this contract using the `verify` function. This auth model specifically uses the SECP256k1 curve native to
 * Ethereum.
 */
contract SECP256k1Model {
    using ECDSA for bytes32;

    /**
     * @notice Verifies a signature against a message and signer address
     * @param _message      The message that was signed
     * @param _signature    The signature to verify
     * @param _signer       The address that signed the message
     * @return bool         True if the signature is valid, false otherwise
     */
    function verify(
        bytes32 _message,
        bytes memory _signature,
        address _signer
    ) public pure returns (bool) {
        return _message.recover(_signature) == _signer;
    }
}
