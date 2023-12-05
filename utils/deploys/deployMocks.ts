import { BigNumber, Signer } from "ethers";

import { Address } from "@utils/types";

import {
  AccountMock__factory,
  ChipRegistryMock__factory,
  ChipValidationsMock__factory,
  ClaimedPBTMock__factory,
  InterfaceIdGetterMock__factory,
  ProjectRegistrarMock__factory,
  TransferPolicyMock__factory,
  DeveloperRegistryMock__factory
} from "../../typechain/factories/contracts/mocks";

import {
  AccountMock,
  ChipRegistryMock,
  ChipValidationsMock,
  ClaimedPBTMock,
  InterfaceIdGetterMock,
  ProjectRegistrarMock,
  TransferPolicyMock,
  DeveloperRegistryMock
} from "../contracts";

export default class DeployMocks {
  private _deployerSigner: Signer;

  constructor(deployerSigner: Signer) {
    this._deployerSigner = deployerSigner;
  }

  public async deployDeveloperRegistryMock(
    owner: Address
  ): Promise<DeveloperRegistryMock> {
    const developerRegistry = await new DeveloperRegistryMock__factory(this._deployerSigner).deploy(owner);
    return developerRegistry;
  }

  public async deployClaimedPBTMock(
    name: string,
    symbol: string,
    maxBlockWindow: BigNumber
  ): Promise<ClaimedPBTMock> {
    const claimedPBTMock = await new ClaimedPBTMock__factory(this._deployerSigner).deploy(
      name,
      symbol,
      maxBlockWindow
    );
    return claimedPBTMock;
  }

  public async deployAccountMock(
    publicKey: Address,
    chipRegistry: Address
  ): Promise<AccountMock> {
    const accountMock = await new AccountMock__factory(this._deployerSigner).deploy(publicKey, chipRegistry);
    return accountMock;
  }

  public async deployProjectRegistrarMock(
    chipRegistry: Address,
    ersRegistry: Address
  ): Promise<ProjectRegistrarMock> {
    const registrarMock = await new ProjectRegistrarMock__factory(this._deployerSigner).deploy(
      chipRegistry,
      ersRegistry
    );
    return registrarMock;
  }

  public async deployInterfaceIdGetterMock(): Promise<InterfaceIdGetterMock> {
    const interfaceIdMock = await new InterfaceIdGetterMock__factory(this._deployerSigner).deploy();
    return interfaceIdMock;
  }

  public async deployChipRegistryMock(
    manufacturerRegistry: Address,
    gatewayUrls: string[],
    maxBlockWindow: BigNumber = BigNumber.from(5),
    maxLockinPeriod: BigNumber = BigNumber.from(1000)
  ): Promise<ChipRegistryMock>{
    const chipRegistryMock = await new ChipRegistryMock__factory(this._deployerSigner).deploy(
      manufacturerRegistry,
      gatewayUrls,
      maxBlockWindow,
      maxLockinPeriod
    );
    return chipRegistryMock;
  }

  public async deployChipValidationsMock(): Promise<ChipValidationsMock>{
    const chipValidationsMock = await new ChipValidationsMock__factory(this._deployerSigner).deploy();
    return chipValidationsMock;
  }

  public async deployTransferPolicyMock(): Promise<TransferPolicyMock>{
    const transferPolicyMock = await new TransferPolicyMock__factory(this._deployerSigner).deploy();
    return transferPolicyMock;
  }
}
