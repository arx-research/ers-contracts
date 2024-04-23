//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { IChipRegistry } from "./interfaces/IChipRegistry.sol";
import { IDeveloperRegistry } from "./interfaces/IDeveloperRegistry.sol";

/**
 * @title ERSRegistry
 * @author Arx
 *
 * @notice Fork of ENSRegistry with adapted data structures and accessiblity logic in order to conform to needs of ERS. Node
 * owners can create any subnode. A node tracks the owner of the node and the address the node resolves to. Within the
 * context of ERS a resolver represents either a smart contract OR a chip. The owner has the ability to create any subnodes
 * of its choosing, however only the DeveloperRegistry is able to change both the owner and the resolver for a given node once
 * created. The ChipRegistry is able to change the owner of a node (signifying a transfer of a chip) but is not able to 
 * change the resolver. These permissions are put in place in order to maintain a track record of authenticity for chips
 * while allowing the DeveloperRegistry to re-assign sub-domains to new DeveloperRegistrars. Note that if a DeveloperRegistry's
 * subnode is reassigned to a new DeveloperRegistrar the new DeveloperRegistrar CANNOT overwrite the nodes created by the
 * previous node owner.
 */
contract ERSRegistry {

    /* ============ Events ============ */
    // Logged when the owner of a node assigns a new owner to a subnode.
    event NewOwner(bytes32 indexed node, bytes32 indexed subnode, bytes32 indexed nameHash, address owner);

    // Logged when the owner of a node transfers ownership to a new account.
    event Transfer(bytes32 indexed node, address owner);

    // Logged when the resolver for a node changes.
    event NewResolver(bytes32 indexed node, address resolver);

    /* ============ Structs ============ */
    struct Record {
        address owner;
        address resolver;
    }

    /* ============ Modifiers ============ */
    // Permits modifications only by the owner of the specified node.
    modifier authorised(bytes32 _node) {
        address owner = records[_node].owner;
        require(owner == msg.sender, "Must be node owner");
        _;
    }

    /* ============ State Variables ============ */
    IChipRegistry public immutable chipRegistry;
    IDeveloperRegistry public immutable developerRegistry;
    
    mapping(bytes32 => Record) public records;
    
    /* ============ Constructor ============ */

    /**
     * @dev Constructs a new ERS registry.
     */
    constructor(IChipRegistry _chipRegistry, IDeveloperRegistry _developerRegistry) {
        chipRegistry = _chipRegistry;
        developerRegistry = _developerRegistry;
        records[0x0].owner = msg.sender;
    }

    /* ============ External Functions ============ */

    // TODO: consider letting owners set their own resolvers; change default resolver to services registry

    /**
     * @dev ONLY CHIP REGISTRY: Sets the record on behalf of a new chip or project subnode. Note that ChipRegistry is not the node owner.
     *
     * @param _node     The parent node.
     * @param _nameHash The hash of the nameHash specifying the subnode.
     * @param _owner    The address of the new owner.
     * @param _resolver The address that the new nameHash resolves to.
     * @return The newly created subnode hash
     */
    function createChipRegistrySubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash,
        address _owner,
        address _resolver
    )
        external
        virtual
        returns(bytes32)
    {
        require(msg.sender == address(chipRegistry), "Caller must be ChipRegistry");
        bytes32 subnode = _calculateSubnode(_node, _nameHash);
        require(_owner != address(0), "New owner cannot be null address");
        require(!recordExists(subnode), "Subnode already exists");

        _setOwner(subnode, _owner);
        _setResolver(subnode, _resolver);

        emit NewOwner(_node, subnode, _nameHash, _owner);
        return subnode;
    }

    /**
     * @dev ONLY DEPLOYER, DEVELOPER REGISTRY or DEVELOPER REGISTRAR: Sets the record for a new subnode. May only be called by owner of node (checked in _setSubnodeOwner).
     *
     * @param _node     The parent node.
     * @param _nameHash The hash of the nameHash specifying the subnode.
     * @param _owner    The address of the new owner.
     * @param _resolver The address that the new nameHash resolves to.
     * @return The newly created subnode hash
     */
    function createSubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash,
        address _owner,
        address _resolver
    )
        external
        virtual
        authorised(_node)
        returns(bytes32)
    {
        address deployerCaller = records[0x0].owner;

        // Check to see if caller is the ERS deployer, DeveloperRegistry or a DeveloperRegistrar
        require(msg.sender == deployerCaller || msg.sender == address(developerRegistry) || developerRegistry.isDeveloperRegistrar(msg.sender), "Caller must be Deployer or DeveloperRegistry");
        
        bytes32 subnode = _calculateSubnode(_node, _nameHash);
        require(_owner != address(0), "New owner cannot be null address");
        require(!recordExists(subnode), "Subnode already exists");

        _setOwner(subnode, _owner);
        _setResolver(subnode, _resolver);

        emit NewOwner(_node, subnode, _nameHash, _owner);
        return subnode;
    }

    /**
     * @dev ONLY Developer REGISTRY: Deletes the record for an already created subnode. Developer Registry must be the owner of the node so as to not
     * accidentally delete a non DeveloperRegistrar subnode.
     *
     * @param _node     The parent node.
     * @param _nameHash The hash of the nameHash specifying the subnode.
     */
    function deleteSubnodeRecord(
        bytes32 _node,
        bytes32 _nameHash
    )
        external
        virtual
        authorised(_node)
    {
        require(msg.sender == address(developerRegistry), "Caller must be DeveloperRegistry");

        bytes32 subnode = _calculateSubnode(_node, _nameHash);
        require(recordExists(subnode), "Subnode does not exist");

        _setOwner(subnode, address(0));
        _setResolver(subnode, address(0));

        emit NewOwner(_node, subnode, _nameHash, address(0));
    }

    /**
     * @dev ONLY CHIP REGISTRY: Transfers ownership of a node to a new address. Owner cannot directly call (unless root node),
     * ChipRegistry must manage ownership changes for chips in order to keep state consistent between ChipRegistry and ERS.
     *
     * @param _node     The node to transfer ownership of.
     * @param _newOwner The address of the new owner.
     */
    function setNodeOwner(
        bytes32 _node,
        address _newOwner
    )
        external
        virtual
    {
        // if node isn't 0x0 then ChipRegistry must be caller, if it is then owner must be caller
        address requiredCaller = _node == 0x0 ? records[_node].owner : address(chipRegistry);
        require(msg.sender == requiredCaller, "Caller must be ChipRegistry or owner of node");
        require(_newOwner != address(0), "New owner cannot be null address");
        require(recordExists(_node), "Node does not exist");

        _setOwner(_node, _newOwner);
        emit Transfer(_node, _newOwner);
    }

    /* ============ View Functions ============ */

    /**
     * @dev Validate that state has been correctly set for a chip. Used by ChipRegistry to validate that a ProjectRegistrar has
     * set the correct state for a chip.
     *
     * @param _node     The specified node.
     * @param _chipId   The specified chipId.
     * @return bool indicating whether state is valid
     */
    function isValidChipState(
        bytes32 _node,
        address _chipId
    )
        external
        virtual
        view
        returns(bool)
    {
        return (records[_node].resolver == _chipId);
    }

    /**
     * @dev Returns the address that owns the specified node.
     *
     * @param _node     The specified node.
     * @return address of the owner.
     */
    function getOwner(bytes32 _node) public view virtual returns (address) {
        return records[_node].owner;
    }

    /**
     * @dev Returns the address that owns the specified subnode.
     *
     * @param _node         The specified node.
     * @param _nameHash     The specified nameHash.
     * @return address of the owner.
     */
    function getSubnodeOwner(bytes32 _node, bytes32 _nameHash) external view virtual returns (address) {
        bytes32 subnode = _calculateSubnode(_node, _nameHash);
        return getOwner(subnode);
    }

    /**
     * @dev Returns the address of the resolver for the specified node.
     *
     * @param _node     The specified node.
     * @return address of the resolver.
     */
    function getResolver(bytes32 _node) external view virtual returns (address) {
        return records[_node].resolver;
    }

    /**
     * @dev Returns whether a record has been written to the registry for that node.
     *
     * @param _node The specified node.
     * @return Bool if record exists
     */
    function recordExists(bytes32 _node) public view virtual returns (bool) {
        return records[_node].owner != address(0);
    }

    /**
     * @dev Returns the subnode hash of node + nameHash. This is the keccak256 hash of `node` + `nameHash`.
     *
     * @param _node     The specified node.
     * @param _nameHash The specified nameHash.
     */
    function getSubnodeHash(bytes32 _node, bytes32 _nameHash) external pure returns (bytes32) {
        return _calculateSubnode(_node, _nameHash);
    }

    /* ============ Internal Functions ============ */

    function _calculateSubnode(bytes32 _node, bytes32 _nameHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_node, _nameHash));
    }

    function _setOwner(bytes32 node, address owner) internal virtual {
        records[node].owner = owner;
    }

    function _setResolver(bytes32 _node, address _resolver) internal virtual {
        records[_node].resolver = _resolver;
        emit NewResolver(_node, _resolver);
    }
}
