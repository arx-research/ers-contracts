//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IProjectRegistrar } from "./IProjectRegistrar.sol";
import { ITransferPolicy } from "./ITransferPolicy.sol";

interface IDeveloperRegistrar {
    function initialize(bytes32 _rootNode) external;
    function rootNode() external view returns (bytes32);

    function addProject(
        bytes32 _nameHash,
        IProjectRegistrar _projectRegistrar,
        address _projectPublicKey,
        bytes32 _serviceId,
        ITransferPolicy _transferPolicy,
        uint256 _lockinPeriod,
        bytes calldata _ownershipProof
    )
        external;
     
}
