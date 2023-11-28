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
  TSMRegistrar,
  TSMRegistrarFactory,
  TSMRegistry
} from "..";
import { TSMRegistrar__factory } from "../../typechain/factories/contracts";

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
  public tsmRegistry: TSMRegistry;
  public ersRegistry: ERSRegistry;
  public servicesRegistry: ServicesRegistry;
  public tsmRegistrarFactory: TSMRegistrarFactory;

  public tsmRegistrar: TSMRegistrar;
  public tsmManager: ArxProjectEnrollmentManager;

  constructor(provider: providers.Web3Provider | providers.JsonRpcProvider, ownerAddress: Address) {
    this._provider = provider;
    this._ownerAddress = ownerAddress;
    this._ownerSigner = provider.getSigner(ownerAddress);
    this._deployer = new DeployHelper(this._ownerSigner);
  }

  public async initializeProtocol(maxBlockWindow: BigNumber = BigNumber.from(10)): Promise<void> {
    this.manufacturerRegistry = await this._deployer.deployManufacturerRegistry(this._ownerAddress);
    this.chipRegistry = await this._deployer.deployChipRegistry(this.manufacturerRegistry.address, [], maxBlockWindow);
    this.tsmRegistry = await this._deployer.deployTSMRegistry(this._ownerAddress);
    this.ersRegistry = await this._deployer.deployERSRegistry(this.chipRegistry.address, this.tsmRegistry.address);
    this.servicesRegistry = await this._deployer.deployServicesRegistry(this.chipRegistry.address, maxBlockWindow);
    this.tsmRegistrarFactory = await this._deployer.deployTSMRegistrarFactory(this.chipRegistry.address, this.ersRegistry.address, this.tsmRegistry.address);

    await this.tsmRegistry.initialize(this.ersRegistry.address, [this.tsmRegistrarFactory.address]);
    await this.chipRegistry.initialize(this.ersRegistry.address, this.servicesRegistry.address, this.tsmRegistry.address);

    await this.ersRegistry.createSubnodeRecord(
      NULL_NODE,
      calculateLabelHash("ers"),
      this.tsmRegistry.address,
      this.tsmRegistry.address
    );
  }

  public async initializeProject(projectName: string, maxBlockWindow: BigNumber = BigNumber.from(10)): Promise<void> {
    await this.tsmRegistry.addAllowedTSM(this._ownerAddress, calculateLabelHash(projectName));

    const tx = await this.tsmRegistry.createNewTSMRegistrar(this.tsmRegistrarFactory.address);
    this.tsmRegistrar = new TSMRegistrar__factory(this._ownerSigner).attach(
      await this._getTSMRegistrarAddress(tx.hash, this.tsmRegistry)
    );

    this.tsmManager = await this._deployer.deployArxProjectEnrollmentManager(
      this.chipRegistry.address,
      this.tsmRegistrar.address,
      this.ersRegistry.address,
      this.manufacturerRegistry.address,
      ADDRESS_ZERO,
      maxBlockWindow
    );
  }

  private async  _getTSMRegistrarAddress(txHash: string, tsmRegistry: TSMRegistry): Promise<Address> {
    const receipt: ethers.providers.TransactionReceipt = await this._provider.getTransactionReceipt(txHash);
    const registrarAddress: Address = tsmRegistry.interface.parseLog(receipt.logs[receipt.logs.length - 1]).args.tsmRegistrar;
    return registrarAddress;
  }
}
