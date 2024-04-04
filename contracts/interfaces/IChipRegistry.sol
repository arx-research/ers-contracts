//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IPBT } from "../token/IPBT.sol";
import { IProjectRegistrar } from "./IProjectRegistrar.sol";
import { ITransferPolicy } from "./ITransferPolicy.sol";

interface IChipRegistry is IPBT {

    // struct DeveloperMerkleInfo {
    //     uint256 developerIndex;

    //     string tokenUri;
    // }

    // struct ChipAddition {
    //     address owner;
    //     DeveloperMerkleInfo developerMerkleInfo;
    // }

    struct ManufacturerValidation {
        bytes32 enrollmentId;
        bytes manufacturerCertificate;
    }

    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        address _projectPublicKey,
        bytes32 serviceId,
        ITransferPolicy _transferPolicy,
        uint256 lockinPeriod,
        bytes calldata _signature
    )
        external;

    function addChip(
        address _chipId,
        address _owner,
        ManufacturerValidation calldata _manufacturerValidation
    )
        external;        
}
