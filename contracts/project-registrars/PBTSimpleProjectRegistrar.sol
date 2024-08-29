//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { BaseProjectRegistrar } from "./BaseProjectRegistrar.sol";
import { ChipValidations } from "../lib/ChipValidations.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { IDeveloperRegistrar } from "../interfaces/IDeveloperRegistrar.sol";

import { PBTSimple } from "../token/PBTSimple.sol";
import { IPBT } from "../token/IPBT.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

/**
 * @title BaseProjectRegistrar
 * @author Arx Research
 * 
 * @notice Base contract for ProjectRegistrars. Contains common functionality for all ProjectRegistrars including setting the root node
 * and claiming chips.
 */
contract PBTSimpleProjectRegistrar is BaseProjectRegistrar, PBTSimple {
    using ChipValidations for address;

    /* ============ Structs ============ */
    struct ProjectChipAddition {
        address chipId;
        address chipOwner;
        bytes32 nameHash; // A label used to identify the chip; in a PBT imlementation, this might match the tokenId
        IChipRegistry.ManufacturerValidation manufacturerValidation;
        bytes custodyProof;
    }
    
    /* ============ Constructor ============ */
    /**
     * @param _chipRegistry             The chip registry of the ERS system being used
     * @param _ers                      The ERS registry of the ERS system being used
     * @param _developerRegistrar       The DeveloperRegistrar that made this project
     * @param _name                     The name of the custom PBT token
     * @param _symbol                   The symbol of the custom PBT token
     */
    constructor(
        IChipRegistry _chipRegistry, 
        IERS _ers, 
        IDeveloperRegistrar _developerRegistrar,
        string memory _name,
        string memory _symbol,
        string memory _baseURI,
        uint256 _maxBlockWindow,
        ITransferPolicy _transferPolicy
    ) 
        PBTSimple(_name, _symbol, _baseURI, _maxBlockWindow, _transferPolicy)
        BaseProjectRegistrar(
            _chipRegistry,
            _ers,
            _developerRegistrar
        )
    {}

    /* ============ External Admin Functions ============ */

    /**
     * @dev Owner set the transfer policy for PBT.
     * @param _newPolicy        The address of the new transfer policy. We allow the zero address in case owner doesn't want to allow xfers.
     */
    function setTransferPolicy(
        ITransferPolicy _newPolicy
    )
        public
        onlyOwner()
    {
        _setTransferPolicy(_newPolicy);
    }

    /**
     * @notice ONLY OWNER: Allows the contract owner to update the base URI for the PBT tokens.
     *
     * @param updatedBaseURI The new base URI to set for the tokens.
     */
    function setBaseURI(
        string memory updatedBaseURI
    ) 
        public 
        onlyOwner() 
    {
        baseURI = updatedBaseURI;
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
        override(PBTSimple)
    {
        revert("Not implemented");
    }

    /**
     * @notice Allow a user to transfer a chip to a new owner, new owner must submit transaction. Use ChipPBT logic which calls
     * TransferPolicy to execute the transfer of the PBT and chip. Update chip's ERS node in order to keep data consistency. EIP-1271
     * compatibility should be implemented in the chip's TransferPolicy contract.
     *
     * @param chipId                Chip ID (address) of chip being transferred
     * @param signatureFromChip     Signature of keccak256(msg.sender, blockhash(blockNumberUsedInSig), _payload) signed by chip
     *                              being transferred
     * @param blockNumberUsedInSig  Block number used in signature
     * @param useSafeTransferFrom   Indicates whether to use safeTransferFrom or transferFrom
     * @param payload               Encoded payload containing data required to execute transfer. Data structure will be dependent
     *                              on implementation of TransferPolicy
     */
    function transferToken(
        address chipId,
        bytes calldata signatureFromChip,
        uint256 blockNumberUsedInSig,
        bool useSafeTransferFrom,
        bytes calldata payload
    ) 
        public
        override(PBTSimple)
    {
        // Validations happen in PBTSimple / TransferPolicy
        PBTSimple.transferToken(chipId,  signatureFromChip, blockNumberUsedInSig, useSafeTransferFrom, payload);
        chipRegistry.setChipNodeOwner(chipId, msg.sender);
    }    

    /**
     * @dev ONLY CHIP OWNER (enforced in PBTSimple): Sets the owner for a chip. Chip owner must submit transaction
     * along with a signature from the chipId commiting to a block the signature was generated. This is to prevent
     * any replay attacks. If the transaction isn't submitted within the MAX_BLOCK_WINDOW from the commited block
     * this function will revert. Additionally, the chip's ERS node owner is updated to maintain state consistency.
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
        override
    {   
        // Validations happen in PBTSimple, ERC721 doesn't allow transfers to the zero address
        PBTSimple.setOwner(_chipId, _newOwner, _commitBlock, _signature);
        chipRegistry.setChipNodeOwner(_chipId, _newOwner);
    }

    /**
     * @notice ONLY OWNER: Allow the project manager to add chips to the project.
     * 
     * @param _chips    Array of information needed for claiming chips
     */
    function addChips(
        ProjectChipAddition[] calldata _chips
    ) 
        external
        onlyOwner()
    {
        for (uint256 i = 0; i < _chips.length; i++) {
            ProjectChipAddition memory chip = _chips[i];
            _addChip(
                chip.chipId,
                chip.chipOwner,
                chip.nameHash,
                chip.manufacturerValidation,
                chip.custodyProof
            );
            _mint(
                chip.chipOwner,
                chip.chipId,
                chip.nameHash
            );
        }
    }

    /**
     * 
     * @param _interfaceId The interface ID to check for
     */
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        override(BaseProjectRegistrar, PBTSimple)
        returns (bool)
    {
        return
            _interfaceId == type(IProjectRegistrar).interfaceId ||
            _interfaceId == type(IPBT).interfaceId ||
            super.supportsInterface(_interfaceId);
    }
}



