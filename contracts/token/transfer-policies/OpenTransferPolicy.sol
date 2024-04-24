//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ITransferPolicy } from "../../interfaces/ITransferPolicy.sol";

/**
 * @title OpenTransferPolicy
 * @dev This transfer policy performs no checks and creates parity with the PBT standard
 * transferTokenWithChip function. TransferPolicy is necessary because the ChipRegistry does
 * not support transferTokenWithChip so that transferToken cannot be overridden.
 */
contract OpenTransferPolicy is ITransferPolicy {

    /* ============ Constructor ============ */

    constructor() {}
    
    /* ============ External Functions ============ */
    /**
      * @notice This function enforces no additional checks and allows the transfer to proceed
      * for parity with transferTokenWithChip function in PBT standard.
      */
    function authorizeTransfer(
        address /*_chipId*/,
        address /*_sender*/,
        address /*_chipOwner*/,
        bytes calldata /*_payload*/,
        bytes calldata /*_signature*/
    )
        external
        override
    {}
}
