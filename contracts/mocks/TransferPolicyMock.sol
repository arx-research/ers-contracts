//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

contract TransferPolicyMock is ITransferPolicy {

    struct CallInfo {
        address chipId;
        address to;
        address sender;
        address chipOwner;
        bytes payload;
        bytes signature;
    }

    CallInfo public callInfo;
    /* ============ Constructor ============ */

    constructor() {}
    
    /* ============ External Functions ============ */

    function authorizeTransfer(
        address _chipId,
        address _to,
        address _sender,
        address _chipOwner,
        bytes calldata _payload,
        bytes calldata _signature
    )
        external
        override
    {
        callInfo = CallInfo({
            chipId: _chipId,
            to: _to,
            sender: _sender,
            chipOwner: _chipOwner,
            payload: _payload,
            signature: _signature
        });
    }

    receive() external payable {}
}
