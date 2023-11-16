//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IPBT } from "../token/IPBT.sol";

contract AccountMock is IERC1271 {

    using ECDSA for bytes32;

    bytes4 public constant MAGIC_VALUE = 0x1626ba7e;

    address public publicKey;
    IPBT public chipRegistry;

    constructor(address _publicKey, address _chipRegistry) {
        publicKey = _publicKey;
        chipRegistry = IPBT(_chipRegistry);
    }

    function transferTokenWithChip(
        bytes calldata signatureFromChip,
        uint256 blockNumberUsedInSig,
        bool useSafeTransferFrom
    )
        external
    {
        chipRegistry.transferTokenWithChip(signatureFromChip, blockNumberUsedInSig, useSafeTransferFrom);
    }

    function transferToken(
        address chipId,
        bytes calldata signatureFromChip,
        uint256 blockNumberUsedInSig,
        bool useSafeTransferFrom,
        bytes calldata payload
    )
        external
    {
        chipRegistry.transferToken(chipId, signatureFromChip, blockNumberUsedInSig, useSafeTransferFrom, payload);
    }

    function isValidSignature(bytes32 _hash, bytes memory _signature) external view override returns (bytes4) {
        if (_hash.recover(_signature) == publicKey) {
            return MAGIC_VALUE;
        } else {
            return 0xffffffff;
        }
    }

    function onERC721Received(
        address /*operator*/,
        address /*from*/,
        uint256 /*tokenId*/,
        bytes calldata /*data*/
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
