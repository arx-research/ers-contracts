//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import { ChipRegistry } from "../ChipRegistry.sol";
import { ClaimedPBT } from "../token/ClaimedPBT.sol";
import { IChipRegistry } from "../interfaces/IChipRegistry.sol";
import { IManufacturerRegistry } from "../interfaces/IManufacturerRegistry.sol";
import { ITransferPolicy } from "../interfaces/ITransferPolicy.sol";

contract ChipRegistryMock is ChipRegistry {
    address public chipId;
    IChipRegistry.ChipClaim public chipClaim;
    IChipRegistry.ManufacturerValidation public  manufacturerValidation;
    bytes public developerInclusionProof;
    bytes public developerCustodyProof;
    
    constructor(
        IManufacturerRegistry _manufacturerRegistry,
        string[] memory _gatewayUrls,
        uint256 _maxBlockWindow,
        uint256 _maxLockinPeriod
    )
        ChipRegistry(_manufacturerRegistry, _gatewayUrls, _maxBlockWindow, _maxLockinPeriod)
    {}

    function claimChip(
        address _chipId,
        IChipRegistry.ChipClaim calldata _chipClaim,
        IChipRegistry.ManufacturerValidation memory _manufacturerValidation,
        bytes calldata _developerInclusionProof,
        bytes calldata _developerCustodyProof
    ) external override {
        chipId = _chipId;
        chipClaim = _chipClaim;
        manufacturerValidation = _manufacturerValidation;
        developerInclusionProof = _developerInclusionProof;
        developerCustodyProof = _developerCustodyProof;
    }

    function mockClaimChip(address _chipId, address _owner) external {
        ChipInfo memory chipInfo = ChipInfo({
            tokenId: 0,     // temporary value, will be set in _mint
            transferPolicy: ITransferPolicy(address(0)),
            tokenUri: "",
            tokenData: ""
        });
        ClaimedPBT._mint(_owner, _chipId, chipInfo);
    }

    function setInitialService(address _chipId, bytes32 _serviceId, uint256 _timelock) external {
        servicesRegistry.setInitialService(_chipId, _serviceId, _timelock);
    }
}
