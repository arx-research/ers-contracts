//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IPBT } from "../token/IPBT.sol";
import { IProjectRegistrar } from "./IProjectRegistrar.sol";
import { ITransferPolicy } from "./ITransferPolicy.sol";

interface IChipRegistry is IPBT {

    struct DeveloperMerkleInfo {
        uint256 developerIndex;
        bytes32 serviceId;
        uint256 lockinPeriod;
        string tokenUri;
    }

    struct ChipAddition {
        address owner;
        bytes32 rootNode;
        bytes32 nameHash;
        DeveloperMerkleInfo developerMerkleInfo;
    }

    struct ManufacturerValidation {
        bytes32 enrollmentId;
        bytes manufacturerCertificate;
    }

    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        address _projectPublicKey,
        ITransferPolicy _transferPolicy,
        bytes calldata _signature
    )
        external;

    function addChip(
        address _chipId,
        ChipAddition calldata _ChipAddition,
        ManufacturerValidation calldata _manufacturerValidation
    )
        external;        
}
