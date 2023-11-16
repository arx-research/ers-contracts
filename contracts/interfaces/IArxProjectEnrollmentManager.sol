//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IArxProjectEnrollmentManager {

    function addProject(
        string memory tsmCertificateLocation,
        string memory claimAppURL,
        bytes32 nameHash,
        bytes32 merkleRoot,
        address projectPublicKey,
        bytes calldata ownershipProof
    )
        external;

}

