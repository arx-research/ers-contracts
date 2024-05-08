//SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ChipRegistry } from "../ChipRegistry.sol";
import { PBTSimple } from "../token/PBTSimple.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IDeveloperRegistry } from "../interfaces/IDeveloperRegistry.sol";
import { IERS } from "../interfaces/IERS.sol";
import { IProjectRegistrar } from "../interfaces/IProjectRegistrar.sol";
import { IServicesRegistry } from "../interfaces/IServicesRegistry.sol";
import { IManufacturerRegistry } from "../interfaces/IManufacturerRegistry.sol";
import { PBTSimpleMock } from "./PBTSimpleMock.sol";

contract ChipRegistryMock is ChipRegistry {
    mapping(address=>bool) public chipIds;
    mapping(address=>address) public chipOwners;

    IServicesRegistry public servicesRegistry;
    
    constructor(
        IManufacturerRegistry _manufacturerRegistry,
        uint256 _maxLockinPeriod,
        address _migrationSigner
    )
        ChipRegistry(_manufacturerRegistry, _maxLockinPeriod, _migrationSigner)
    {}

    function initializeMock(IERS _ers, IServicesRegistry _servicesRegistry, IDeveloperRegistry _developerRegistry) external {
        ers = _ers;
        servicesRegistry = _servicesRegistry;
        developerRegistry = _developerRegistry;
    }

    // Note: this originally set PBT chip state, but we currently bypass that for simpler testing
    function mockAddChip(address _chipId, address _owner) external {
        chipIds[_chipId] = true;
        chipOwners[_chipId] = _owner;
    }

    function setInitialService(
        address _chipId, 
        bytes32 _serviceId,
        uint256 _timelock
    ) external {
        servicesRegistry.setInitialService(_chipId, _serviceId, _timelock);
    }

    function ownerOf(address _chipId) public view override(ChipRegistry) returns (address) {
        // Not a great way to appropach this for testing...see `ownerOf` in ChipRegistry.sol
        require(chipOwners[_chipId] != address(0), "Chip not added");
        return chipOwners[_chipId];
    }
}
