//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IProjectRegistrar } from "./IProjectRegistrar.sol";
import { ITransferPolicy } from "./ITransferPolicy.sol";

interface ITSMRegistrar {
    function initialize(bytes32 _rootNode) external;
    function rootNode() external view returns (bytes32);
    function addProject(
        bytes32 _nameHash,
        IProjectRegistrar _projectRegistrar,
        bytes32 _merkleRoot,
        address _projectPublicKey,
        ITransferPolicy _transferPolicy,
        bytes calldata _ownershipProof,
        string calldata _projectClaimDataUri
    )
        external;
}
