//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface ITransferPolicy {
    function authorizeTransfer(
        address _chipId,
        address _sender,
        address _chipOwner,
        bytes calldata _payload,
        bytes calldata _signature
    ) external;
}
