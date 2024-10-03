//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface ITransferPolicy {
    function authorizeTransfer(
        address _chipId,
        address _to,
        address _sender,
        address _chipOwner,
        bytes calldata _payload,
        bytes calldata _signature
    ) external;
}
