//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IProjectRegistrar {
    function rootNode() external view returns (bytes32);
    
    function setRootNode(
        bytes32 _rootNode
    )
        external;

    function ownerOf(address _chipId) external view returns (address);
}
