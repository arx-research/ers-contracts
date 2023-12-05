import { BigNumber, ethers, providers, Signer } from "ethers";
import { ADDRESS_ZERO, NULL_NODE } from "../constants";

import {
  Address
} from "../types";
import {
  ArxProjectEnrollmentManager,
  ChipRegistry,
  DeployHelper,
  ERSRegistry,
  ManufacturerRegistry,
  ServicesRegistry,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistry
} from "..";
import { DeveloperRegistrar__factory } from "../../typechain/factories/contracts";

export * from "./signatures";

export const createTokenData = (ersNode: string, enrollmentId: string): string => {
  return ethers.utils.solidityPack(["bytes32", "bytes32"], [ersNode, enrollmentId]);
};

// create keccak256 hash of subnode
export const calculateSubnodeHash = (ersName: string): string => {
  let node: string = NULL_NODE;

  if (ersName === '') {
    return node;
  }

  const nameArray = ersName.split('.').reverse();
  for (const name of nameArray) {
    const labelHash = calculateLabelHash(name);
    const packed = ethers.utils.solidityPack(["bytes32", "bytes32"], [node, labelHash]);

    node = ethers.utils.keccak256(packed);
  }

  return node;
};

export const calculateLabelHash = (label: string): string => {
  return ethers.utils.keccak256(Buffer.from(label));
};

export const calculateEnrollmentId = (manufacturerId: string, currentNonce: BigNumber): string => {
  return ethers.utils.keccak256(ethers.utils.solidityPack(
    ["bytes32", "uint256"],
    [manufacturerId, currentNonce]
  ));
};

export class ERSFixture {
  private _provider: providers.Web3Provider | providers.JsonRpcProvider;
  private _ownerAddress: Address;
  private _ownerSigner: Signer;
  private _deployer: DeployHelper;

  public manufacturerRegistry: ManufacturerRegistry;
  public chipRegistry: ChipRegistry;
  public developerRegistry: DeveloperRegistry;
  public ersRegistry: ERSRegistry;
  public servicesRegistry: ServicesRegistry;
  public developerRegistrarFactory: DeveloperRegistrarFactory;

  public developerRegistrar: DeveloperRegistrar;
  public developerManager: ArxProjectEnrollmentManager;

  constructor(provider: providers.Web3Provider | providers.JsonRpcProvider, ownerAddress: Address) {
    this._provider = provider;
    this._ownerAddress = ownerAddress;
    this._ownerSigner = provider.getSigner(ownerAddress);
    this._deployer = new DeployHelper(this._ownerSigner);
  }

  public async initializeProtocol(maxBlockWindow: BigNumber = BigNumber.from(10)): Promise<void> {
    this.manufacturerRegistry = await this._deployer.deployManufacturerRegistry(this._ownerAddress);
    this.chipRegistry = await this._deployer.deployChipRegistry(this.manufacturerRegistry.address, [], maxBlockWindow);
    this.developerRegistry = await this._deployer.deployDeveloperRegistry(this._ownerAddress);
    this.ersRegistry = await this._deployer.deployERSRegistry(this.chipRegistry.address, this.developerRegistry.address);
    this.servicesRegistry = await this._deployer.deployServicesRegistry(this.chipRegistry.address, maxBlockWindow);
    this.developerRegistrarFactory = await this._deployer.deployDeveloperRegistrarFactory(this.chipRegistry.address, this.ersRegistry.address, this.developerRegistry.address);

    await this.developerRegistry.initialize(this.ersRegistry.address, [this.developerRegistrarFactory.address]);
    await this.chipRegistry.initialize(this.ersRegistry.address, this.servicesRegistry.address, this.developerRegistry.address);

    await this.ersRegistry.createSubnodeRecord(
      NULL_NODE,
      calculateLabelHash("ers"),
      this.developerRegistry.address,
      this.developerRegistry.address
    );
  }

  public async initializeProject(projectName: string, maxBlockWindow: BigNumber = BigNumber.from(10)): Promise<void> {
    await this.developerRegistry.addAllowedDeveloper(this._ownerAddress, calculateLabelHash(projectName));

    const tx = await this.developerRegistry.createNewDeveloperRegistrar(this.developerRegistrarFactory.address);
    this.developerRegistrar = new DeveloperRegistrar__factory(this._ownerSigner).attach(
      await this._getDeveloperRegistrarAddress(tx.hash, this.developerRegistry)
    );

    this.developerManager = await this._deployer.deployArxProjectEnrollmentManager(
      this.chipRegistry.address,
      this.developerRegistrar.address,
      this.ersRegistry.address,
      this.manufacturerRegistry.address,
      ADDRESS_ZERO,
      maxBlockWindow
    );
  }

  private async  _getDeveloperRegistrarAddress(txHash: string, developerRegistry: DeveloperRegistry): Promise<Address> {
    const receipt: ethers.providers.TransactionReceipt = await this._provider.getTransactionReceipt(txHash);
    const registrarAddress: Address = developerRegistry.interface.parseLog(receipt.logs[receipt.logs.length - 1]).args.developerRegistrar;
    return registrarAddress;
  }
}
