import { BigNumber, Signer } from "ethers";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";

import {
  ArxProjectEnrollmentManager__factory,
  ChipRegistry__factory,
  ERSRegistry__factory,
  ManufacturerRegistry__factory,
  ServicesRegistry__factory,
  TSMRegistrar__factory,
  TSMRegistrarFactory__factory,
  TSMRegistry__factory
} from "../../typechain/factories/contracts";

import { ProjectRegistrar__factory } from "../../typechain/factories/contracts/project-registrars";
import { SECP256k1Model__factory } from "../../typechain/factories/contracts/auth-models";
import {
  ChipRegistry,
  ERSRegistry,
  ManufacturerRegistry,
  SECP256k1Model,
  ServicesRegistry,
  TSMRegistrar,
  TSMRegistrarFactory,
  TSMRegistry,
  ProjectRegistrar,
  ArxProjectEnrollmentManager
} from "../contracts";

import DeployMocks from "./deployMocks";
import DeployTokens from "./deployTokens";
import DeployTransferPolicies from "./deployTransferPolicies";

export default class DeployHelper {
  private _deployerSigner: Signer;
  public mocks: DeployMocks;
  public tokens: DeployTokens;
  public transferPolicies: DeployTransferPolicies;

  constructor(deployerSigner: Signer) {
    this._deployerSigner = deployerSigner;
    this.mocks = new DeployMocks(deployerSigner);
    this.tokens = new DeployTokens(deployerSigner);
    this.transferPolicies = new DeployTransferPolicies(deployerSigner);
  }

  public async deployManufacturerRegistry(governance:Address): Promise<ManufacturerRegistry> {
    const mRegistry = await new ManufacturerRegistry__factory(this._deployerSigner).deploy(governance);
    return mRegistry;
  }

  public async deployERSRegistry(chipRegistry: Address, tsmRegistry: Address): Promise<ERSRegistry> {
    const ersRegistry = await new ERSRegistry__factory(this._deployerSigner).deploy(
      chipRegistry,
      tsmRegistry
    );
    return ersRegistry;
  }

  public async deployTSMRegistrarFactory(
    chipRegistry: Address,
    ersRegistry: Address,
    tsmRegistry: Address
  ): Promise<TSMRegistrarFactory> {
    const tsmRegistrarFactory = await new TSMRegistrarFactory__factory(this._deployerSigner).deploy(
      chipRegistry,
      ersRegistry,
      tsmRegistry
    );
    return tsmRegistrarFactory;
  }

  public async deployTSMRegistry(owner: Address): Promise<TSMRegistry> {
    const tsmRegistry = await new TSMRegistry__factory(this._deployerSigner).deploy(
      owner
    );
    return tsmRegistry;
  }

  public async deployTSMRegistrar(
    owner: Address,
    chipRegistry: Address,
    ersRegistry: Address,
    tsmRegistry: Address
  ): Promise<TSMRegistrar> {
    const tsmRegistrar = await new TSMRegistrar__factory(this._deployerSigner).deploy(
      owner,
      chipRegistry,
      ersRegistry,
      tsmRegistry
    );
    return tsmRegistrar;
  }

  public async getTSMRegistrar(registrarAddress: Address): Promise<TSMRegistrar> {
    return new TSMRegistrar__factory(this._deployerSigner).attach(registrarAddress);
  }

  public async deployTSMRegistrarFromFactory(
    tsmRegistry: TSMRegistry,
    deployer: Account,
    factory: Address
  ): Promise<TSMRegistrar> {
    const expectedAddress = await tsmRegistry.connect(deployer.wallet).callStatic.createNewTSMRegistrar(
      factory
    );

    await tsmRegistry.connect(deployer.wallet).createNewTSMRegistrar(factory);

    return await this.getTSMRegistrar(expectedAddress);
  }


  public async deployChipRegistry(
    manufacturerRegistry: Address,
    gatewayUrls: string[] = [],
    maxBlockWindow: BigNumber = BigNumber.from(5),
    maxLockinPeriod: BigNumber = BigNumber.from(1000)
  ): Promise<ChipRegistry> {
    const chipRegistry = await new ChipRegistry__factory(this._deployerSigner).deploy(
      manufacturerRegistry,
      gatewayUrls,
      maxBlockWindow,
      maxLockinPeriod
    );
    return chipRegistry;
  }

  public async deployServicesRegistry(
    chipRegistry: Address,
    maxBlockWindow: BigNumber = BigNumber.from(5)
  ): Promise<ServicesRegistry> {
    const servicesRegistry = await new ServicesRegistry__factory(this._deployerSigner).deploy(chipRegistry, maxBlockWindow);

    return servicesRegistry;
  }

  public async deployProjectRegistrar(
    projectManager: Address,
    chipRegistry: Address,
    ersRegistry: Address,
    tsmRegistrar: Address,
    maxBlockWindow: BigNumber = BigNumber.from(5)
  ): Promise<ProjectRegistrar> {
    const projectRegistrar = await new ProjectRegistrar__factory(this._deployerSigner).deploy(
      projectManager,
      chipRegistry,
      ersRegistry,
      tsmRegistrar,
      maxBlockWindow
    );

    return projectRegistrar;
  }

  public async getProjectRegistrar(registrarAddress: Address): Promise<ProjectRegistrar> {
    return new ProjectRegistrar__factory(this._deployerSigner).attach(registrarAddress);
  }

  public async deployArxProjectEnrollmentManager(
    chipRegistry: Address,
    tsmRegistrar: Address,
    ers: Address,
    manufacturerRegistry: Address,
    transferPolicy: Address,
    maxBlockWindow: BigNumber = BigNumber.from(5)
  ): Promise<ArxProjectEnrollmentManager>{
    const arxProjectEnrollmentManager = await new ArxProjectEnrollmentManager__factory(this._deployerSigner).deploy(
      chipRegistry,
      tsmRegistrar,
      ers,
      manufacturerRegistry,
      transferPolicy,
      maxBlockWindow
    );

    return arxProjectEnrollmentManager;
  }

  public async deploySECP256k1Model(): Promise<SECP256k1Model> {
    const secp256k1Model = await new SECP256k1Model__factory(this._deployerSigner).deploy();
    return secp256k1Model;
  }
}
