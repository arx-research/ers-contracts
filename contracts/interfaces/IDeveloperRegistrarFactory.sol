//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IDeveloperRegistrarFactory {
    function deployRegistrar(address _owner) external returns(address);
}
