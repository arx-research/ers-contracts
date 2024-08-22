import { BigNumber, Signer } from "ethers";

import { Address } from "@utils/types";

import {
  AccountMock__factory,
  ChipRegistryMock__factory,
  ChipValidationsMock__factory,
  InterfaceIdGetterMock__factory,
  ProjectRegistrarMock__factory,
  TransferPolicyMock__factory,
  DeveloperRegistrarMock__factory,
  DeveloperRegistryMock__factory,
  PBTSimpleMock__factory
} from "../../typechain/factories/contracts/mocks";

import {
  AccountMock,
  ChipRegistryMock,
  ChipValidationsMock,
  PBTSimpleMock,
  InterfaceIdGetterMock,
  ProjectRegistrarMock,
  TransferPolicyMock,
  DeveloperRegistrarMock,
  DeveloperRegistryMock
} from "../contracts";
import { ADDRESS_ZERO } from "..";

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

  public async deployDeveloperRegistrarMock(
    chipRegistry: Address,
    ersRegistry: Address,
    developerRegistry: Address,
    servicesRegistry: Address
  ): Promise<DeveloperRegistrarMock> {
    const developerRegistrar = await new DeveloperRegistrarMock__factory(this._deployerSigner).deploy(
      chipRegistry,
      ersRegistry,
      developerRegistry,
      servicesRegistry
    );
    return developerRegistrar;
  }

  public async deployPBTSimpleMock(
    name: string,
    symbol: string,
    baseURI: string,
    maxBlockWindow: BigNumber,
    transferPolicy: Address
  ): Promise<PBTSimpleMock> {
    const pbtSimpleMock = await new PBTSimpleMock__factory(this._deployerSigner).deploy(
      name,
      symbol,
      baseURI,
      maxBlockWindow,
      transferPolicy
    );
    return pbtSimpleMock;
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
    ersRegistry: Address,
    developerRegistrar: Address = ADDRESS_ZERO
  ): Promise<ProjectRegistrarMock> {
    const registrarMock = await new ProjectRegistrarMock__factory(this._deployerSigner).deploy(
      chipRegistry,
      ersRegistry,
      developerRegistrar
    );
    return registrarMock;
  }

  public async deployInterfaceIdGetterMock(): Promise<InterfaceIdGetterMock> {
    const interfaceIdMock = await new InterfaceIdGetterMock__factory(this._deployerSigner).deploy();
    return interfaceIdMock;
  }

  public async deployChipRegistryMock(
    manufacturerRegistry: Address,
    maxLockinPeriod: BigNumber = BigNumber.from(1000),
    migrationSigner: Address
  ): Promise<ChipRegistryMock>{
    const chipRegistryMock = await new ChipRegistryMock__factory(this._deployerSigner).deploy(
      manufacturerRegistry,
      maxLockinPeriod,
      migrationSigner
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
