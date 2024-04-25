//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ChipRegistry } from "../ChipRegistry.sol";
import { PBTSimple } from "../token/PBTSimple.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { IManufacturerRegistry } from "../interfaces/IManufacturerRegistry.sol";
import { PBTSimpleMock } from "./PBTSimpleMock.sol";

contract ChipRegistryMock is ChipRegistry {
    mapping(address=>bool) public chipIds;
    mapping(address=>address) public chipOwners;
    
    constructor(
        IManufacturerRegistry _manufacturerRegistry,
        uint256 _maxLockinPeriod
    )
        ChipRegistry(_manufacturerRegistry, _maxLockinPeriod)
    {}

    function addChip(
        address _chipId,
        address _owner,
        bytes32 _nameHash,
        IChipRegistry.ManufacturerValidation memory /*_manufacturerValidation*/
    ) 
      external
      override
    {
      chipIds[_chipId] = true;
      chipOwners[_chipId] = _owner;

      // Get the project's root node which is used in the creation of the subnode
      bytes32 rootNode = IProjectRegistrar(msg.sender).rootNode();

      // Create the chip subnode record in the ERS; if the node already exists, this should revert
      ers.createChipRegistrySubnodeRecord(
        rootNode, 
        _nameHash, 
        _owner, 
        address(servicesRegistry)
      );
    }

    // Note: this originally set PBT chip state, but we currently bypass that for simpler testing
    function mockAddChip(address _chipId, bytes32 _ersNode, address _owner) external {
        chipIds[_chipId] = true;
        chipOwners[_chipId] = _owner;
    }

    function setInitialService(address _chipId, bytes32 _serviceId, uint256 _timelock) external {
        servicesRegistry.setInitialService(_chipId, _serviceId, _timelock);
    }

    function ownerOf(address _chipId) public view override(ChipRegistry) returns (address) {
        // Not a great way to appropach this for testing...see `ownerOf` in ChipRegistry.sol
        require(chipOwners[_chipId] != address(0), "Chip not added");
        return chipOwners[_chipId];
    }
}
