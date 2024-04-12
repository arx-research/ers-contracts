//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IPBT } from "../token/IPBT.sol";
import { IProjectRegistrar } from "./IProjectRegistrar.sol";
import { ITransferPolicy } from "./ITransferPolicy.sol";

interface IChipRegistry is IPBT {

    struct ManufacturerValidation {
        bytes32 enrollmentId;
        bytes manufacturerCertificate;
    }

    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        address _projectPublicKey,
        bytes32 _nameHash,
        bytes32 _serviceId,
        ITransferPolicy _transferPolicy,
        uint256 _lockinPeriod,
        bytes calldata _signature
    )
        external;

    function addChip(
        address _chipId,
        address _owner,
        bytes32 _nodeLabel,
        ManufacturerValidation calldata _manufacturerValidation
    )
        external;        
}
