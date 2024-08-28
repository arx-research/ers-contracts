//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { IProjectRegistrar } from "./IProjectRegistrar.sol";

interface IDeveloperRegistrar {
    function initialize(address _owner, bytes32 _rootNode) external;
    function rootNode() external view returns (bytes32);
    function owner() external view returns (address);

    function addProject(
        IProjectRegistrar _projectRegistrar,
        bytes32 _nameHash,
        bytes32 _serviceId,
        uint256 _lockinPeriod
    )
        external;

    function removeProject(
        IProjectRegistrar _projectRegistrar
    )
        external;

    function getProjects() external view returns (address[] memory);
     
}
