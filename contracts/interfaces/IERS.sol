//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IERS {
    function createSubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash,
        address _owner,
        address _resolver
    ) external returns(bytes32);

    function deleteSubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash
    ) external;

    function setNodeOwner(
        bytes32 _node,
        address _owner
    ) external;

    function isValidChipState(
        bytes32 _node,
        address _chipId,
        address _owner
    ) external view returns(bool);

    function getSubnodeHash(
        bytes32 _node,
        bytes32 _nameHash
    )
        external
        pure
        returns (bytes32);

    function getSubnodeOwner(
        bytes32 _node,
        bytes32 _nameHash
    )
        external
        view
        returns (address);
}
