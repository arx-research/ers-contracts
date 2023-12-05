//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IDeveloperRegistry {
    function isDeveloperRegistrar(address _registrar) external view returns(bool);
}
