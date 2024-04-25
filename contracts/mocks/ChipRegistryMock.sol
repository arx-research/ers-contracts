//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ChipRegistry } from "../ChipRegistry.sol";
import { PBTSimple } from "../token/PBTSimple.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { IManufacturerRegistry } from "../interfaces/IManufacturerRegistry.sol";

contract ChipRegistryMock is ChipRegistry {
    mapping(address=>bool) public chipIds;
    
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

    // function mockAddChip(address _chipId, bytes32 _ersNode, address _owner) external {
    //     PBTSimple._mint(_owner, _chipId, _ersNode);
    // }

    function setInitialService(address _chipId, bytes32 _serviceId, uint256 _timelock) external {
        servicesRegistry.setInitialService(_chipId, _serviceId, _timelock);
    }
}
