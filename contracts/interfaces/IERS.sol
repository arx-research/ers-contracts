//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;


interface IERS {

    function createChipRegistrySubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash,
        address _owner,
        address _resolver
    ) external returns(bytes32);

    function createSubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash,
        address _owner,
        address _resolver
    ) external returns(bytes32);

    function deleteChipRegistrySubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash
    ) external;

    function deleteSubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash
    ) external;

    function setNodeOwner(
        bytes32 _node,
        address _owner
    ) external;

    function getSubnodeHash(
        bytes32 _node,
        bytes32 _nameHash
    )
        external
        pure
        returns (bytes32);

    function getOwner(
        bytes32 _node
    )
        external
        view
        returns (address);

    function getSubnodeOwner(
        bytes32 _node,
        bytes32 _nameHash
    )
        external
        view
        returns (address);

    function getResolver(
        bytes32 _node
    )
        external
        view
        returns (address);

    function recordExists(
        bytes32 _node
    )
        external
        view
        returns (bool);
}
