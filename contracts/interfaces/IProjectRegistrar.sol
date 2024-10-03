//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

interface IProjectRegistrar {
    function rootNode() external view returns (bytes32);
    
    function setRootNode(
        bytes32 _rootNode
    )
        external;

    function ownerOf(address _chipId) external view returns (address);
}
