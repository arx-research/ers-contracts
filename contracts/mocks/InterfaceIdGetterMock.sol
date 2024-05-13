//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Metadata } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IPBT } from "../token/IPBT.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";

contract InterfaceIdGetterMock {
    constructor() {}

    function getERC165InterfaceId() external pure returns (bytes4) {
        return type(IERC165).interfaceId;
    }

    function getERC721InterfaceId() external pure returns (bytes4) {
        return type(IERC721).interfaceId;
    }

    function getERC721MetadataInterfaceId() external pure returns (bytes4) {
        return type(IERC721Metadata).interfaceId;
    }

    function getPBTInterfaceId() external pure returns (bytes4) {
        return type(IPBT).interfaceId;
    }

    function getProjectRegistrarInterfaceId() external pure returns (bytes4) {
        return type(IProjectRegistrar).interfaceId;
    }

    function getChipRegistryInterfaceId() external pure returns (bytes4) {
        return type(IChipRegistry).interfaceId;
    }
}
