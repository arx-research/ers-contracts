//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface ITSMRegistry {
    function isTSMRegistrar(address _registrar) external view returns(bool);
}
