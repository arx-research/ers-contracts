// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IPBT } from "./IPBT.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

/**
 * @dev Contract for PBTs (Physical Backed Tokens).
 * Modified PBT that allows for direct setting of owner and includes a transfer policy.
 */

interface IPBTSimple is IPBT {

    function setOwner(
        address _chipId,
        address _newOwner,
        uint256 _commitBlock,
        bytes calldata _signature
    ) 
        external;
        
}
