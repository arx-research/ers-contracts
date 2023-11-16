//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IPBT } from "../token/IPBT.sol";
import { IProjectRegistrar } from "./IProjectRegistrar.sol";
import { ITransferPolicy } from "./ITransferPolicy.sol";

interface IChipRegistry is IPBT {

    struct TSMMerkleInfo {
        uint256 tsmIndex;
        bytes32 serviceId;
        uint256 lockinPeriod;
        string tokenUri;
        bytes32[] tsmProof;
    }

    struct ChipClaim {
        address owner;
        bytes32 ersNode;
        TSMMerkleInfo tsmMerkleInfo;
    }

    struct ManufacturerValidation {
        bytes32 enrollmentId;
        uint256 mIndex;
        bytes32[] manufacturerProof;
    }

    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        address _projectPublicKey,
        ITransferPolicy _transferPolicy,
        bytes32 _merkleRoot,
        bytes calldata _signature,
        string calldata _projectClaimDataUri
    )
        external;
    
    function claimChip(
        address _chipId,
        ChipClaim calldata _chipClaim,
        ManufacturerValidation calldata _manufacturerValidation,
        bytes calldata _tsmCertificate,
        bytes calldata _custodyProof
    )
        external;
}
