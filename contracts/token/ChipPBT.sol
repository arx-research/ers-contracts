//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC721Metadata } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { ChipValidations } from "../lib/ChipValidations.sol";
import { ERC721ReadOnly } from "./ERC721ReadOnly.sol";
import { IPBT } from "./IPBT.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

/**
 * @title ChipPBT
 * @author Arx
 *
 * @notice Implementation of PBT where tokenIds are assigned to chip addresses as the chips are added. Each chip has its own
 * transfer policy, which can be set by the chip owner and allows the owner to specify how the chip can be transferred to another party. This
 * enables more flexibility for secondary services to facilitate the transfer of chips. Additionally, chip owners can directly transfer their
 * chips by calling setOwner, this function is only callable by the chip owner whereas the transfer function is callable by anyone (assuming
 * transfer policy conditions have been met). Since there is often other metadata associated with a chip we provide a tokenData field that can
 * be written to by inheriting contracts.
 */
contract ChipPBT is IPBT, ERC721ReadOnly {
    using SignatureChecker for address;
    using ChipValidations for address;
    using ECDSA for bytes;
    using ECDSA for bytes32;
    using Strings for uint256;

    /* ============ Events ============ */

    event TransferPolicyChanged(address indexed chipId, address transferPolicy);    // Emitted in setTransferPolicy
    
    /* ============ Structs ============ */

    // tokenData is a byte array that can be used to store any data that an inheriting contract may need for its logic.
    // Inheriting contract is responsible for encoding/decoding the data.
    // struct ChipInfo {
    //     uint256 tokenId;
    //     ITransferPolicy transferPolicy;
    //     string tokenUri;
    //     bytes tokenData;
    // }

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
    uint256 public immutable maxBlockWindow;                       // Amount of blocks from commitBlock after which chip signatures are expired
    string public baseURI;                                         // Base URI for token metadata
    mapping(address=>uint256) public chipIdToTokenId;              // Maps chipId to tokenId (tokenId is the node in ERS)
    mapping(address=>ITransferPolicy) public chipTransferPolicy;   // Maps a chipId to a ChipInfo struct

    // TODO: we might want tokenIdToChipId as a function on ChipRegistry
    // mapping(uint256=>address) public tokenIdToChipId;   // Maps an ERC-721 token ID to a chipId

    /* ============ Constructor ============ */

    /**
     * @dev Constructor for ClaimedPBT. Sets the name and symbol for the token.
     *
     * @param _name             The name of the token
     * @param _symbol           The symbol of the token
     * @param _maxBlockWindow   The maximum amount of blocks a signature used for updating chip table is valid for
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _maxBlockWindow,
        string memory _baseTokenURI
    )
        ERC721ReadOnly(_name, _symbol)
    {
        maxBlockWindow = _maxBlockWindow;
        baseURI = _baseTokenURI;
    }

    /* ============ External Functions ============ */

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
        virtual
        onlyMintedChip(chipId)
    {
        // ChipInfo memory chipInfo = chipTable[chipId];
        address chipOwner = ownerOf(tokenIdFor(chipId));
        
        // Check the transfer policy from the project enrollment?
        require(chipTransferPolicy[chipId] != ITransferPolicy(address(0)), "Transfer policy must be set");

        // Check that the signature is valid, create own scope to prevent stack-too-deep error
        {
            bytes32 signedHash = _createSignedHash(blockNumberUsedInSig, payload);
            require(chipId.isValidSignatureNow(signedHash, signatureFromChip), "Invalid signature");
        }

        _transferPBT(chipOwner, tokenIdFor(chipId), useSafeTransfer);

        // Validation of the payload beyond ensuring it was signed by the chip is left up to the TransferPolicy contract.
        //authorizeTransfer(address _chipId, address _sender, address _chipOwner, bytes _payload, bytes _signature)
        chipTransferPolicy[chipId].authorizeTransfer(
            chipId,
            msg.sender,
            chipOwner,
            payload,
            signatureFromChip
        );
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
        onlyChipOwner(_chipId)
    {
        // Check that the signature is valid for the payload
        _chipId.validateSignatureAndExpiration(
            _commitBlock,
            maxBlockWindow,
            abi.encodePacked(_commitBlock, _newPolicy),     // Formulate the payload
            _signature
        );

        // Set the transfer policy
        chipTransferPolicy[_chipId] = _newPolicy;

        emit TransferPolicyChanged(_chipId, address(_newPolicy));
    }

    /**
     * @dev ONLY CHIP OWNER: Sets the owner for a chip. Chip owner must submit transaction along with
     * a signature from the chipId commiting to a block the signature was generated. This is to prevent any
     * replay attacks. If the transaction isn't submitted within the MAX_BLOCK_WINDOW from the commited block
     * this function will revert.
     *
     * @param _chipId           The chipId to set the owner for
     * @param _newOwner         The address of the new chip owner
     * @param _commitBlock      The block the signature is tied to (used to put a time limit on the signature)
     * @param _signature        The signature generated by the chipId (should just be a signature of the commitBlock)
     */
    function setOwner(
        address _chipId,
        address _newOwner,
        uint256 _commitBlock,
        bytes calldata _signature
    )
        public
        virtual
        onlyChipOwner(_chipId)
    {
        // Check that the signature is valid for the payload
        _chipId.validateSignatureAndExpiration(
            _commitBlock,
            maxBlockWindow,
            abi.encodePacked(_commitBlock, _newOwner),  // Formulate the payload
            _signature
        );

        // Set the new owner
        _transfer(msg.sender, _newOwner, tokenIdFor(_chipId));
    }

    /* ============ View Functions ============ */

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

    /**
     * @dev Returns the tokenURI for a given chipId. Chip must have been claimed / token minted.
     *
     * @param _chipId      The tokenId to get the tokenURI for
     * @return string       The tokenURI for the given tokenId
     */
    function tokenURI(address _chipId) public view virtual onlyMintedChip(_chipId) returns (string memory) {
        return bytes(baseURI).length > 0 ? string.concat(baseURI, chipIdToTokenId[_chipId].toString()) : "";
    }

    /**
     * @dev Returns the tokenId for a given chipId
     *
     * @param _chipId       The chipId to get the tokenId for
     * @return tokenId      The tokenId for the given chipId
     */
    function tokenIdFor(address _chipId) public view returns (uint256 tokenId) {
        require(chipIdToTokenId[_chipId] != 0, "Chip must be minted");
        return chipIdToTokenId[_chipId];
    }

    /**
     * @dev Returns the owner of a given chipId
     *
     * @param _chipId       The chipId to get the owner for
     * @return address      The owner of the given chipId
     */
    function ownerOf(address _chipId) public view override returns (address) {
        return ownerOf(tokenIdFor(_chipId));
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
     * @dev Mints a new token and assigns it to the given address. Also adds the chipId to the tokenIdToChipId mapping,
     * adds the ChipInfo to the chipTable, and increments the tokenIdCounter.
     *
     * @param _to           The address to mint the token to
     * @param _chipId       The chipId to mint the token for
     * @param _transferPolicy The transfer policy for the chip
     * @return uint256      The tokenId of the newly minted token
     */
    function _mint(
        address _to,
        address _chipId,
        bytes32 _ersNode,
        ITransferPolicy _transferPolicy
    )
        internal
        virtual
        returns(uint256)
    {
        uint256 tokenId = uint256(_ersNode);
        chipTransferPolicy[_chipId] = _transferPolicy;
        super._mint(_to, tokenId);

        chipIdToTokenId[_chipId] = tokenId;

        emit PBTMint(tokenId, _chipId);
        return tokenId;
    }

    function _createSignedHash(
        uint256 _blockNumberUsedInSig,
        bytes memory _customPayload
    )
        internal
        virtual
        returns (bytes32)
    {
        // The blockNumberUsedInSig must be in a previous block because the blockhash of the current
        // block does not exist yet.
        require(block.number >= _blockNumberUsedInSig, "Block number must have been mined");
        require(block.number - _blockNumberUsedInSig <= maxBlockWindow, "Block number must be within maxBlockWindow");

        return abi.encodePacked(msg.sender, blockhash(_blockNumberUsedInSig), _customPayload).toEthSignedMessageHash();
    }

    /**
     * @notice Handle transfer of PBT inclusing whether to transfer using safeTransfer. The _to address is always the msg.sender.
     *
     * @param _from                 Address of owner transferring PBT
     * @param _tokenId              ID of PBT being transferred
     * @param _useSafeTransfer      Indicates whether to use safeTransferFrom or transferFrom
     */
    function _transferPBT(address _from, uint256 _tokenId, bool _useSafeTransfer) internal {
        if (_useSafeTransfer) {
            _safeTransfer(_from, msg.sender, _tokenId, "");
        } else {
            _transfer(_from, msg.sender, _tokenId);
        }
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
