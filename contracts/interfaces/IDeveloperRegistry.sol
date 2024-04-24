//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IDeveloperRegistry {
    function addAllowedDeveloper(address _developerOwner, bytes32 _nameHash) external;
    function removeAllowedDeveloper(address _developerOwner) external;
    function isDeveloperRegistrar(address _registrar) external view returns(bool);
}
