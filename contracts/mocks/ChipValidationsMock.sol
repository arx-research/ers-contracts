//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ChipValidations } from "../lib/ChipValidations.sol";

contract ChipValidationsMock {

    constructor() {}

    function validateSignatureAndExpiration(
        address _chipId,
        uint256 _commitBlock,
        uint256 _maxBlockWindow,
        bytes memory _payload,
        bytes memory _signature
    )
        external
        view
    {
        ChipValidations.validateSignatureAndExpiration(
            _chipId,
            _commitBlock,
            _maxBlockWindow,
            _payload,
            _signature
        );
    }
}
