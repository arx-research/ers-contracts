//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface ITSMRegistrarFactory {
    function deployRegistrar(address _owner) external returns(address);
}
