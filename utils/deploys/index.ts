import { BigNumber, Signer } from "ethers";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";

import {
  ArxProjectEnrollmentManager__factory,
  ChipRegistry__factory,
  DeveloperRegistrar__factory,
  DeveloperRegistrarFactory__factory,
  DeveloperRegistry__factory,
  ERSRegistry__factory,
  ManufacturerRegistry__factory,
  ServicesRegistry__factory
} from "../../typechain/factories/contracts";

import {
  AuthenticityProjectRegistrar__factory,
  RedirectProjectRegistrar__factory
} from "../../typechain/factories/contracts/project-registrars";
import { DeveloperNameGovernor__factory } from "../../typechain/factories/contracts/governance";
import { SECP256k1Model__factory } from "../../typechain/factories/contracts/auth-models";
import {
  ArxProjectEnrollmentManager,
  AuthenticityProjectRegistrar,
  ChipRegistry,
  DeveloperNameGovernor,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistry,
  ERSRegistry,
  ManufacturerRegistry,
  RedirectProjectRegistrar,
  SECP256k1Model,
  ServicesRegistry
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

  public async deployERSRegistry(chipRegistry: Address, developerRegistry: Address): Promise<ERSRegistry> {
    const ersRegistry = await new ERSRegistry__factory(this._deployerSigner).deploy(
      chipRegistry,
      developerRegistry
    );
    return ersRegistry;
  }

  public async deployDeveloperRegistrarFactory(
    chipRegistry: Address,
    ersRegistry: Address,
    developerRegistry: Address
  ): Promise<DeveloperRegistrarFactory> {
    const developerRegistrarFactory = await new DeveloperRegistrarFactory__factory(this._deployerSigner).deploy(
      chipRegistry,
      ersRegistry,
      developerRegistry
    );
    return developerRegistrarFactory;
  }

  public async deployDeveloperRegistry(owner: Address): Promise<DeveloperRegistry> {
    const developerRegistry = await new DeveloperRegistry__factory(this._deployerSigner).deploy(owner);
    return developerRegistry;
  }

  public async deployDeveloperRegistrar(
    owner: Address,
    chipRegistry: Address,
    ersRegistry: Address,
    developerRegistry: Address
  ): Promise<DeveloperRegistrar> {
    const developerRegistrar = await new DeveloperRegistrar__factory(this._deployerSigner).deploy(
      owner,
      chipRegistry,
      ersRegistry,
      developerRegistry
    );
    return developerRegistrar;
  }

  public async getDeveloperRegistrar(registrarAddress: Address): Promise<DeveloperRegistrar> {
    return new DeveloperRegistrar__factory(this._deployerSigner).attach(registrarAddress);
  }

  public async deployDeveloperRegistrarFromFactory(
    developerRegistry: DeveloperRegistry,
    deployer: Account,
    factory: Address
  ): Promise<DeveloperRegistrar> {
    const expectedAddress = await developerRegistry.connect(deployer.wallet).callStatic.createNewDeveloperRegistrar(
      factory
    );

    await developerRegistry.connect(deployer.wallet).createNewDeveloperRegistrar(factory);

    return await this.getDeveloperRegistrar(expectedAddress);
  }


  public async deployChipRegistry(
    manufacturerRegistry: Address,
    maxBlockWindow: BigNumber = BigNumber.from(5),
    maxLockinPeriod: BigNumber = BigNumber.from(1000),
    baseTokenUri: string = "https://resolve.com/chips/"
  ): Promise<ChipRegistry> {
    const chipRegistry = await new ChipRegistry__factory(this._deployerSigner).deploy(
      manufacturerRegistry,
      maxBlockWindow,
      maxLockinPeriod,
      baseTokenUri
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

  public async deployAuthenticityProjectRegistrar(
    projectManager: Address,
    chipRegistry: Address,
    ersRegistry: Address,
    developerRegistrar: Address,
    maxBlockWindow: BigNumber = BigNumber.from(5)
  ): Promise<AuthenticityProjectRegistrar> {
    const projectRegistrar = await new AuthenticityProjectRegistrar__factory(this._deployerSigner).deploy(
      projectManager,
      chipRegistry,
      ersRegistry,
      developerRegistrar,
      maxBlockWindow
    );

    return projectRegistrar;
  }

  public async deployRedirectProjectRegistrar(
    projectManager: Address,
    chipRegistry: Address,
    ersRegistry: Address,
    developerRegistrar: Address
  ): Promise<RedirectProjectRegistrar> {
    const projectRegistrar = await new RedirectProjectRegistrar__factory(this._deployerSigner).deploy(
      projectManager,
      chipRegistry,
      ersRegistry,
      developerRegistrar
    );

    return projectRegistrar;
  }

  public async getRedirectProjectRegistrar(registrarAddress: Address): Promise<AuthenticityProjectRegistrar> {
    return new RedirectProjectRegistrar__factory(this._deployerSigner).attach(registrarAddress);
  }

  public async deployArxProjectEnrollmentManager(
    chipRegistry: Address,
    developerRegistrar: Address,
    ers: Address,
    manufacturerRegistry: Address,
    transferPolicy: Address,
    maxBlockWindow: BigNumber = BigNumber.from(5)
  ): Promise<ArxProjectEnrollmentManager>{
    const arxProjectEnrollmentManager = await new ArxProjectEnrollmentManager__factory(this._deployerSigner).deploy(
      chipRegistry,
      developerRegistrar,
      ers,
      manufacturerRegistry,
      transferPolicy,
      maxBlockWindow
    );

    return arxProjectEnrollmentManager;
  }

  public async deployDeveloperNameGovernor(
    developerRegistry: Address,
    nameGovernor: Address
  ): Promise<DeveloperNameGovernor> {
    const developerNameGovernor = await new DeveloperNameGovernor__factory(this._deployerSigner).deploy(
      developerRegistry,
      nameGovernor
    );

    return developerNameGovernor;
  }

  public async deploySECP256k1Model(): Promise<SECP256k1Model> {
    const secp256k1Model = await new SECP256k1Model__factory(this._deployerSigner).deploy();
    return secp256k1Model;
  }
}
