//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IDeveloperRegistrarFactory {
    function deployDeveloperRegistrar(address _owner) external returns(address);
}
