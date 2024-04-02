//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ChipRegistry } from "../ChipRegistry.sol";
import { ChipPBT } from "../token/ChipPBT.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IManufacturerRegistry } from "../interfaces/IManufacturerRegistry.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

contract ChipRegistryMock is ChipRegistry {
    mapping(address=>bool) public chipIds;
    
    constructor(
        IManufacturerRegistry _manufacturerRegistry,
        uint256 _maxBlockWindow,
        uint256 _maxLockinPeriod,
        string memory _baseTokenUri
    )
        ChipRegistry(_manufacturerRegistry, _maxBlockWindow, _maxLockinPeriod, _baseTokenUri)
    {}

    function addChip(
        address _chipId,
        IChipRegistry.ChipAddition calldata /*_ChipAddition*/,
        IChipRegistry.ManufacturerValidation memory /*_manufacturerValidation*/
    ) external override {
        chipIds[_chipId] = true;
    }

    function mockAddChip(address _chipId, address _owner) external {
        ChipPBT._mint(_owner, _chipId, ITransferPolicy(address(0)));
    }

    function setInitialService(address _chipId, bytes32 _serviceId, uint256 _timelock) external {
        servicesRegistry.setInitialService(_chipId, _serviceId, _timelock);
    }
}
