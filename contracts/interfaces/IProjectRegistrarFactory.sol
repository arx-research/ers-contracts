//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IProjectRegistrarFactory {
    function deployProjectRegistrar(address _owner) external returns(address);
}
