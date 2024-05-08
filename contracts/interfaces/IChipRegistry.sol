//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { IProjectRegistrar } from "./IProjectRegistrar.sol";
import { IServicesRegistry } from "./IServicesRegistry.sol";

interface IChipRegistry {
    function servicesRegistry() external view returns (address);

    struct ManufacturerValidation {
        bytes32 enrollmentId;
        bytes manufacturerCertificate;
    }

    function addProjectEnrollment(
        IProjectRegistrar _projectRegistrar,
        bytes32 _nameHash,
        IServicesRegistry _servicesRegistry,
        bytes32 _serviceId,
        uint256 _lockinPeriod
    )
        external;

    function addChip(
        address _chipId,
        address _owner,
        bytes32 _nameHash,
        ManufacturerValidation calldata _manufacturerValidation,
        bytes calldata _custodyProof
    )
        external;

    function removeProjectEnrollment(
        IProjectRegistrar _projectRegistrar
    )
        external;

    function setChipNodeOwner(
        address _chipId,
        address _newOwner
    )
        external;

    function resolveChip(
        bytes32 _nameHash
    )
        external view returns (address);

    function node(
        address _chipId
    )
        external view returns (bytes32);

    function ownerOf(
        address _chipId
    )
        external view returns (address);

}
