//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { IDeveloperRegistry } from "../interfaces/IDeveloperRegistry.sol";

/**
 * @title DeveloperNameGovernor
 * @notice Contract that coordinates adding a new project for a Developer. Each Developer has their own DeveloperRegistrar which is associated
 * with a .ers subnode in the ERS registry ([developer].ers). In order for a valid name claim the caller must submit a transaction with a valid
 * signature signed by the coordinator of this contract over hash(developerAddress, developerName).
 */

contract DeveloperNameGovernor is Ownable {

    using ECDSA for bytes;
    using SignatureChecker for address;

    /* ============ Events ============ */
    event NameCoordinatorUpdated(address newNameCoordinator);

    /* ============ State Variables ============ */
    IDeveloperRegistry public immutable developerRegistry;
    address public nameCoordinator;

    /* ============ Constructor ============ */
    /**
     * @notice Constructor for DeveloperNameGovernor. Sets the owner and DeveloperRegistry.
     *
     * @param _developerRegistry    DeveloperRegistry contract
     * @param _nameCoordinator      Address of the signer of name claims
     */
    constructor(IDeveloperRegistry _developerRegistry, address _nameCoordinator)
        Ownable()
    {
        developerRegistry = _developerRegistry;
        nameCoordinator = _nameCoordinator;
    }

    /* ============ External Functions ============ */

    /**
     * @notice Claim a name for a developer. The caller must submit a transaction with a valid signature signed by the name coordinator. The
     * name coordinator performs checks for name validity and availability.
     *
     * @param _developerName        ERS name of the developer
     * @param _nameApprovalProof    Signature of the name coordinator over hash(msg.sender, developerName)
     */
    function claimName(
        bytes32 _developerName,
        bytes memory _nameApprovalProof
    ) public {
        // .toEthSignedMessageHash() prepends the message with "\x19Ethereum Signed Message:\n" + message.length and hashes message
        address sender = msg.sender;
        
        bytes32 messageHash = abi.encodePacked(sender, _developerName).toEthSignedMessageHash();
        require(nameCoordinator.isValidSignatureNow(messageHash, _nameApprovalProof), "Invalid signature");

        developerRegistry.addAllowedDeveloper(sender, _developerName);
    }

    /**
     * @notice ONLY OWNER: Remove a name claim for a developer.
     *
     * @param _developerOwner       Address of the developer owner
     */
    function removeNameClaim(address _developerOwner) public onlyOwner {
        developerRegistry.removeAllowedDeveloper(_developerOwner);
    }

    /**
     * @notice ONLY OWNER: Update the name coordinator.
     *
     * @param _newNameCoordinator       Address of the new name coordinator
     */
    function updateNameCoordinator(address _newNameCoordinator) public onlyOwner {
        require(_newNameCoordinator != address(0), "Address cannot be zero address");
        nameCoordinator = _newNameCoordinator;

        emit NameCoordinatorUpdated(_newNameCoordinator);
    }
}
