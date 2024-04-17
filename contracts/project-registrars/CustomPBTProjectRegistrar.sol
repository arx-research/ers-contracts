//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { BaseProjectRegistrar } from "./BaseProjectRegistrar.sol";
import { ChipValidations } from "../lib/ChipValidations.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC721Metadata } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { ChipValidations } from "../lib/ChipValidations.sol";
import { ERC721ReadOnly } from "./../token/ERC721ReadOnly.sol";
import { IPBT } from "./../token/IPBT.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

/**
 * @title CustomPBTProjectRegistrar
 * @author Arx Research
 * 
 * @notice Entry point to add chips to projects that include rich metadata and are represented by
 * their own custom PBT tokenId and collection. Chip ownership and transfers are inherited from
 * the ChipRegistry/ChipPBT. Only tokenId<>chipId and balance state is stored here.
 */
contract CustomPBTProjectRegistrar is BaseProjectRegistrar, IPBT, ERC721ReadOnly {
    using SignatureChecker for address;
    using ChipValidations for address;
    using ECDSA for bytes;
    using ECDSA for bytes32;
    using Strings for uint256;

    /* ============ Structs ============ */
    struct CustomPBTChipAddition {
        address chipId;
        bytes32 nameHash; // A label used to identify the chip; in a PBT imlementation, this might match the tokenId
        uint256 tokenId;
        IChipRegistry.ManufacturerValidation manufacturerValidation;
    }

    /* ============ Events ============ */

    event TransferPolicyChanged(address indexed chipId, address transferPolicy);    // Emitted in setTransferPolicy

    /* ============ Modifiers ============ */

    modifier onlyChipOwner(address _chipId) {
        require(ownerOf(tokenIdFor(_chipId)) == msg.sender, "Caller must be chip owner");
        _;
    }

    modifier onlyMintedChip(address _chipId) {
        require(_exists(_chipId), "Chip must be minted");
        _;
    }

    /* ============ State Variables ============ */
    string public baseURI;                                         // Base URI for token metadata
    mapping(address=>uint256) public chipIdToTokenId;              // Maps chipId to tokenId (tokenId is the node in ERS)
    mapping(uint256=>address) public tokenIdToChipId;              // Maps tokenId to chipId
    mapping(address => uint256) private balances;                 // Mapping owner address to token count

    /* ============ Constructor ============ */
    /**
     * @param _projectManager           The address that will be set as the owner
     * @param _chipRegistry             The chip registry of the ERS system being used
     * @param _ers                      The ERS registry of the ERS system being used
     * @param _developerRegistrar       The DeveloperRegistrar that made this project
     * @param _name                     The name of the custom PBT token
     * @param _symbol                   The symbol of the custom PBT token
     * @param _baseTokenURI             The base URI for the custom PBT token
     */
    constructor(
        address _projectManager, 
        IChipRegistry _chipRegistry, 
        IERS _ers, 
        IDeveloperRegistrar _developerRegistrar,
        string memory _name,
        string memory _symbol,
        string memory _baseTokenURI
    ) 
        ERC721ReadOnly(_name, _symbol)
        BaseProjectRegistrar(
            _projectManager,
            _chipRegistry,
            _ers,
            _developerRegistrar
        )
    {
        baseURI = _baseTokenURI;
    }

    /* ============ External Functions ============ */
    /**
     * @notice ONLY OWNER: Allow the project manager to claim chips for the project. Intended to be used for chips
     * that are meant to be redirected to a URL and not concerned with tracking the full chain of custody. This
     * gives managers to ability to maintain ownership over the chips (and thus the primaryService) for as long
     * as they want.
     * 
     * @param _chips    Array of information needed for claiming chips
     */
    function addChips(
        CustomPBTChipAddition[] calldata _chips
    ) 
        external
        onlyOwner()
    {
        for (uint256 i = 0; i < _chips.length; i++) {
            CustomPBTChipAddition memory chip = _chips[i];
            _createSubnodeAndAddChip(
                chip.chipId,
                msg.sender,
                chip.nameHash,
                chip.manufacturerValidation
            );

            // Here we mint the CustomPBT using the token ID from the CustomPBTChipAddition
            _mintCustomPBT(chip.chipId, chip.tokenId, msg.sender);
        }
    }

    /**
     * @notice Included for compliance with EIP-5791 standard but left unimplemented to ensure transfer policies can't be ignored.
     */
    function transferTokenWithChip(
        bytes calldata /*signatureFromChip*/,
        uint256 /*blockNumberUsedInSig*/,
        bool /*useSafeTransfer*/
    )
        public
        virtual
    {
        revert("Not implemented");
    }

    /**
     * @notice Allow a user to transfer a chip to a new owner with additional checks. A transfer policy must be set in order for
     * transfer to go through. The data contained in _payload will be dependent on the implementation of the transfer policy, however
     * the signature should be signed by the chip. EIP-1271 compatibility should be implemented in the chip's TransferPolicy contract.
     *
     * @param chipId                Chip ID (address) of chip being transferred
     * @param signatureFromChip     Signature of keccak256(msg.sender, blockhash(blockNumberUsedInSig), _payload) signed by chip
     *                              being transferred
     * @param blockNumberUsedInSig  Block number used in signature
     * @param useSafeTransfer       Indicates whether to use safeTransferFrom or transferFrom
     * @param payload               Encoded payload containing data required to execute transfer. Data structure will be dependent
     *                              on implementation of TransferPolicy
     */
    function transferToken(
        address chipId,
        bytes calldata signatureFromChip,
        uint256 blockNumberUsedInSig,
        bool useSafeTransfer,
        bytes calldata payload
    ) 
        public
        override(IPBT)
        onlyMintedChip(chipId)
    {
        // Transfer the CustomPBT
        address chipOwnerBefore = chipRegistry.ownerOf(chipId);

        // Transfer the ChipBPT when we transfer the CustomPBT
        chipRegistry.transferToken(chipId,  signatureFromChip, blockNumberUsedInSig, useSafeTransfer, payload);

        // Transfer the CustomPBT
        address chipOwnerAfter = chipRegistry.ownerOf(chipId);

        unchecked {
            // `_balances[from]` cannot overflow for the same reason as described in `_burn`:
            // `from`'s balance is the number of token held, which is at least one before the current
            // transfer.
            // `_balances[to]` could overflow in the conditions described in `_mint`. That would require
            // all 2**256 token ids to be minted, which in practice is impossible.
            balances[chipOwnerBefore] -= 1;
            balances[chipOwnerAfter] += 1;
        }

        // Emit an ERC721 style transfer event; we don't store any ownership state in CustomPBT.
        emit Transfer(chipOwnerBefore, chipOwnerAfter, chipIdToTokenId[chipId]);

        // _transferPBT(chipOwner, tokenIdFor(chipId), useSafeTransfer);
    }

    /**
     * @dev ONLY CHIP OWNER: Sets the transfer policy for a chip. Chip owner must submit transaction along with
     * a signature from the chipId commiting to a block the signature was generated. This is to prevent any
     * replay attacks. If the transaction isn't submitted within the MAX_BLOCK_WINDOW from the commited block
     * this function will revert.
     *
     * @param _chipId           The chipId to set the transfer policy for
     * @param _newPolicy        The address of the new transfer policy. We allow the zero address in case owner doesn't want to allow xfers.
     * @param _commitBlock      The block the signature is tied to (used to put a time limit on the signature)
     * @param _signature        The signature generated by the chipId (should just be a signature of the commitBlock)
     */
    function setTransferPolicy(
        address _chipId,
        ITransferPolicy _newPolicy,
        uint256 _commitBlock,
        bytes calldata _signature
    )
        public
        virtual
    {
        // Call the chipRegistry which in turn calls ChipPBT
        chipRegistry.setTransferPolicy(_chipId, _newPolicy, _commitBlock, _signature);

        emit TransferPolicyChanged(_chipId, address(_newPolicy));
    }

    /* ============ View Functions ============ */

    // TODO: verify in tests that we get this from IPBT?
    /**
     * @dev Using OpenZeppelin's SignatureChecker library, checks if the signature is valid for the payload. Library is
     * ERC-1271 compatible, so it will check if the chipId is a contract and if so, if it implements the isValidSignature.
     *
     * @param _chipId       The chipId to check the signature for
     * @param _payload      The payload to check the signature for
     * @param _signature    The signature to check
     * @return bool         If the signature is valid, false otherwise
     */
    function isChipSignatureForToken(address _chipId, bytes calldata _payload, bytes calldata _signature)
        public
        view
        returns (bool)
    {
        bytes32 _payloadHash = abi.encodePacked(_payload).toEthSignedMessageHash();
        return _chipId.isValidSignatureNow(_payloadHash, _signature);
    }

    /**
     * @dev Returns the base URI for the token metadata
     *
     * @return string       The base URI for the token metadata
     */
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    /**
     * @dev Returns the tokenURI for a given tokenId. Token must have been minted / chip claimed.
     *
     * @param _tokenId      The tokenId to get the tokenURI for
     * @return string       The tokenURI for the given tokenId
     */
    function tokenURI(
        uint256 _tokenId
    )
        public
        view
        virtual
        override(IERC721Metadata, ERC721)
        returns (string memory)
    {
        _requireMinted(_tokenId);
       
        return bytes(baseURI).length > 0 ? string.concat(baseURI, _tokenId.toString()) : "";
    }

    // TODO: verify that virtual gives us the behavior we want here.
    /**
     * @dev Returns the tokenURI for a given chipId. Chip must have been claimed / token minted.
     *
     * @param _chipId      The tokenId to get the tokenURI for
     * @return string       The tokenURI for the given tokenId
     */
    function tokenURI(address _chipId) 
        public 
        view 
        virtual 
        onlyMintedChip(_chipId) 
        returns (string memory) 
    {
        return bytes(baseURI).length > 0 ? string.concat(baseURI, chipIdToTokenId[_chipId].toString()) : "";
    }

    /**
     * @dev Returns the tokenId for a given chipId
     *
     * @param _chipId       The chipId to get the tokenId for
     * @return tokenId      The tokenId for the given chipId
     */
    function tokenIdFor(address _chipId) 
        public 
        view 
        returns (uint256 tokenId) 
    {
        require(chipIdToTokenId[_chipId] != 0, "Chip must be minted");
        return chipIdToTokenId[_chipId];
    }


    /**
     * @dev See {IERC721-balanceOf}.
     */
    function balanceOf(address owner) 
        public 
        view 
        virtual 
        override(IERC721, ERC721)
        returns (uint256) 
    {
        require(owner != address(0), "ERC721: address zero is not a valid owner");
        return balances[owner];
    }

    /**
     * @dev Returns the owner of a given chipId
     *
     * @param _chipId       The chipId to get the owner for
     * @return address      The owner of the given chipId
     */
    function ownerOf(address _chipId) 
        public 
        view 
        override 
        returns (address) 
    {
        return chipRegistry.ownerOf(_chipId);
    }

    function supportsInterface(bytes4 _interfaceId)
        public
        view
        virtual
        override(ERC721, IERC165)
        returns (bool)
    {
        return _interfaceId == type(IPBT).interfaceId || super.supportsInterface(_interfaceId);
    }

    /* ============ Internal Functions ============ */

    /**
     * @dev "Mints" a new token which inherits ownership from ChipRegistry/ChipPBT.
     * In this context minting is primarily writing mappings we need to track the new
     * tokenId.
     *
     * @param _chipId       The chipId to mint the token for
     * @return uint256      The tokenId of the newly minted token
     */
    function _mintCustomPBT(
        address _chipId,
        uint256 _tokenId,
        address _owner
    )
        internal
        virtual
        returns(uint256)
    {
        require(chipIdToTokenId[_chipId] == 0, "Chip already minted");
        require(tokenIdToChipId[_tokenId] == address(0), "Token already minted");
        
        chipIdToTokenId[_chipId] = _tokenId;
        tokenIdToChipId[_tokenId] = _chipId;
        balances[_owner] += 1;

        emit PBTMint(_tokenId, _chipId);
        return _tokenId;
    }

    /**
     * @dev Indicates whether the chipId has been claimed or not
     *
     * @param _chipId       The chipId to check
     * @return bool         True if the chipId has been claimed, false otherwise
     */
    function _exists(address _chipId) internal view returns (bool) {
        // TODO: review this logic closely; ERC721.sol will revert if the tokenId doen't exist
        return chipIdToTokenId[_chipId] != 0;
    }
}



