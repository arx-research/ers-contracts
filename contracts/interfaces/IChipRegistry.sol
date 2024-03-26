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

    struct ChipClaim {
        address owner;
        bytes32 ersNode;
        DeveloperMerkleInfo developerMerkleInfo;
    }

    // struct ManufacturerValidation {
    //     bytes32 enrollmentId;
    //     uint256 mIndex;
    //     bytes32[] manufacturerProof;
    // }

    struct ManufacturerValidation {
        bytes32 enrollmentId;
        bytes calldata manufacturerCertificate;
    }

    // function addProjectEnrollment(
    //     IProjectRegistrar _projectRegistrar,
    //     address _projectPublicKey,
    //     ITransferPolicy _transferPolicy,
    //     bytes32 _merkleRoot,
    //     bytes calldata _signature,
    //     string calldata _projectClaimDataUri
    // )
    //     external;

    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        address _projectPublicKey,
        ITransferPolicy _transferPolicy,
        bytes calldata _signature,
    )
        external;
    
    // function claimChip(
    //     address _chipId,
    //     ChipClaim calldata _chipClaim,
    //     ManufacturerValidation calldata _manufacturerValidation,
    //     bytes calldata _developerInclusionProof,
    //     bytes calldata _developerCustodyProof
    // )
    //     external;

    function addChip(
        address _chipId,
        ChipClaim calldata _chipClaim,
        ManufacturerValidation calldata _manufacturerValidation,
    )
        external;        
}
