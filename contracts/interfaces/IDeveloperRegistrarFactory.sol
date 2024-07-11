//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IDeveloperRegistrarFactory {
    function deployDeveloperRegistrar() external returns(address);
}
