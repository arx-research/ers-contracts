// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

/**
 * @dev Contract for PBTs (Physical Backed Tokens).
 * NFTs that are backed by a physical asset, through a chip embedded in the physical asset.
 */

interface IPBT is IERC721Metadata {

    function tokenIdFor(address chipAddress) external view returns (uint256);

    function isChipSignatureForToken(uint256 tokenId, bytes calldata payload, bytes calldata signature)
        external
        view
        returns (bool);

    function transferTokenWithChip(
        bytes calldata signatureFromChip,
        uint256 blockNumberUsedInSig,
        bool useSafeTransferFrom
    )
        external;

    function transferToken(
        address chipId,
        bytes calldata signatureFromChip,
        uint256 blockNumberUsedInSig,
        bool useSafeTransferFrom,
        bytes calldata payload
    ) external;

    function ownerOf(address _chipId) external view returns (address);

    /// @notice Emitted when a token is minted.
    event PBTMint(uint256 indexed tokenId, address indexed chipAddress);

    /// @notice Emitted when a token is mapped to a different chip.
    /// Chip replacements may be useful in certain scenarios (e.g. chip defect).
    event PBTChipRemapping(uint256 indexed tokenId, address indexed oldChipAddress, address indexed newChipAddress);
}