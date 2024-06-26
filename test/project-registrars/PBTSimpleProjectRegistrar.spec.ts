import "module-alias/register";

import { ethers } from "hardhat";
import { Address } from "@utils/types";

import {
  ManufacturerValidationInfo,
  ProjectChipAddition,
  ServiceRecord
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ChipRegistryMock,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistry,
  ERSRegistry,
  EnrollmentSECP256k1Model,
  InterfaceIdGetterMock,
  ManufacturerRegistry,
  OpenTransferPolicy,
  PBTSimpleProjectRegistrar,
  ServicesRegistry
} from "@utils/contracts";
import { NULL_NODE, ZERO } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import {
  calculateEnrollmentId,
  calculateLabelHash,
  calculateSubnodeHash,
  createManufacturerCertificate,
  createDeveloperCustodyProof,
  createMigrationProof
} from "@utils/protocolUtils";

import { Blockchain } from "@utils/common";
import { BigNumber } from "ethers";
const expect = getWaffleExpect();

describe.only("PBTSimpleProjectRegistrar", () => {
  let owner: Account;
  let developerOne: Account;
  let developerTwo: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let projectManager: Account;
  let authModel: Account;
  let fakeDeveloperRegistrar: Account;

  let projectRegistrar: PBTSimpleProjectRegistrar;
  let manufacturerRegistry: ManufacturerRegistry;
  let enrollmentAuthModel: EnrollmentSECP256k1Model;
  let ersRegistry: ERSRegistry;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let developerRegistry: DeveloperRegistry;
  let servicesRegistry: ServicesRegistry;

  // Chip Registry Mock is used to be able to test the arguments passed to ChipRegistry.claimChip
  let chipRegistry: ChipRegistryMock;
  let transferPolicy: OpenTransferPolicy;
  let newTransferPolicy: Account;
  let developerRegistrar: DeveloperRegistrar;

  let manufacturerId: string;
  let serviceId: string;
  let serviceRecords: ServiceRecord[];
  let projectNameHash: string;
  let deployer: DeployHelper;

  // Developer Data
  let developerChipsEnrollmentId: string;
  let developerNameHash: string;

  // Manufacturer Chip Enrollment Data
  let manufacturerCertSigner: string;
  let manufacturerChipAuthModel: string;
  let manufacturerValidationUri: string;
  let manufacturerBootloaderApp: string;
  let manufacturerChipModel: string;

  let chainId: number;

  const blockchain = new Blockchain(ethers.provider);

  beforeEach(async () => {
    // Environment set up
    [
      owner,
      developerOne,
      developerTwo,
      manufacturerOne,
      chipOne,
      chipTwo,
      projectManager,
      authModel,
      fakeDeveloperRegistrar,
      newTransferPolicy,
    ] = await getAccounts();
    deployer = new DeployHelper(owner.wallet);

    chainId = await blockchain.getChainId();

    // Example Developer Data
    developerNameHash = calculateLabelHash("Gucci");

    // 1. Deploy example ERS system's Manufacturer Registry
    manufacturerRegistry = await deployer.deployManufacturerRegistry(owner.address);

    // 2. Add example manufacture to Manufacturer Registry
    manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
    await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);
    enrollmentAuthModel = await deployer.deployEnrollmentSECP256k1Model();

    developerChipsEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);

    // 3. Enroll chips to Manufacturer Registry under example manufacturer
    // Example Manufacturer Chip Enrollment Data
    manufacturerCertSigner = manufacturerOne.address;
    manufacturerChipAuthModel = authModel.address;
    manufacturerValidationUri = "ipfs://bafy";
    manufacturerBootloaderApp = "https://bootloader.app";
    manufacturerChipModel = "SuperCool ChipModel";

    // Contract function call
    await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
      manufacturerId,
      manufacturerCertSigner,
      manufacturerChipAuthModel,
      enrollmentAuthModel.address,
      manufacturerValidationUri,
      manufacturerBootloaderApp,
      manufacturerChipModel
    );

    // 4. Deploy chip registry
    chipRegistry = await deployer.mocks.deployChipRegistryMock(manufacturerRegistry.address, BigNumber.from(1000), owner.address);

    // 5. Deploy Developer Registry
    developerRegistry = await deployer.deployDeveloperRegistry(owner.address);

    // 6. Deploy ERS Registry
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

    // 7. Deploy Services Registry
    servicesRegistry = await deployer.deployServicesRegistry(chipRegistry.address);

    // 8. Deploy Developer Registrar Factory
    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistry.address,
      servicesRegistry.address
    );

    // 9. Initialize Chip Registry
    await chipRegistry.connect(owner.wallet).initializeMock(
      ersRegistry.address,
      servicesRegistry.address,
      developerRegistry.address
    );

    // 10. Initialize Developer Registry
    await developerRegistry.connect(owner.wallet).initialize(
      ersRegistry.address,
      [developerRegistrarFactory.address],
      owner.address
    );

    // 12. Add owner as Developer
    await developerRegistry.connect(owner.wallet).addAllowedDeveloper(developerOne.address, developerNameHash);

    // 13. Deploy Developer Registrar from Developer Registry
    // Developer Registry checks if it's initialized when createNewDeveloperRegistrar is called
    // by checking the factory address & ers registry address

    // Simulate call to retrieve expected Developer Registrar address
    const expectedRegistrarAddress = await developerRegistry
      .connect(developerOne.wallet)
      .callStatic.createNewDeveloperRegistrar(developerRegistrarFactory.address);

    // Actual contract call
    await developerRegistry
      .connect(developerOne.wallet)
      .createNewDeveloperRegistrar(developerRegistrarFactory.address);

    // Create Developer Registrar object
    developerRegistrar = await deployer.getDeveloperRegistrar(expectedRegistrarAddress);

    // 14. Deploy project registrar and transfer ownership to developer
    transferPolicy = await deployer.transferPolicies.deployOpenTransferPolicy();
    projectRegistrar = await deployer.deployPBTSimpleProjectRegistrar(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistrar.address,
      "ProjectY",
      "PRY",
      "https://api.projecty.com/",
      BigNumber.from(5),
      transferPolicy.address
    );

    await projectRegistrar.connect(owner.wallet).transferOwnership(developerOne.address);
    await projectRegistrar.connect(developerOne.wallet).acceptOwnership();

    // 15. Create example service for project

    // Example service data
    serviceId = ethers.utils.formatBytes32String("Gucci-Flex");
    serviceRecords = [
      {
        recordType: ethers.utils.formatBytes32String("tokenUri"),
        content: ethers.utils.hexlify(Buffer.from("api.gucci.com/tokens/1")),
        appendId: true,
      },
      {
        recordType: ethers.utils.formatBytes32String("redirectUrl"),
        content: ethers.utils.hexlify(Buffer.from("flex.gucci.com")),
        appendId: false,
      },
    ];

    // Register service
    await servicesRegistry.createService(serviceId, serviceRecords);

    // 16. Add Project to ERS System

    // Example project data
    projectNameHash = calculateLabelHash("ProjectX");

    // Call Developer Registrar to add project
    await developerRegistrar
      .connect(developerOne.wallet)
      .addProject(
        projectRegistrar.address,
        projectNameHash,
        serviceId,
        100
      );

  });

  describe("#constructor", async() => {
    it("should set the state correctly", async () => {
      const actualOwner = await projectRegistrar.owner();
      const actualChipRegistry = await projectRegistrar.chipRegistry();
      const actualERSRegistry = await projectRegistrar.ers();
      const actualDeveloperRegistrar = await projectRegistrar.developerRegistrar();

      expect(actualOwner).to.eq(developerOne.address);
      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualERSRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistrar).to.eq(developerRegistrar.address);
    });
  });

  describe("#addChip", async() => {
    let subjectAdditionData: ProjectChipAddition[];
    let subjectCaller: Account;

    beforeEach(async () => {
      const chipIdOne = chipOne.address;
      const nameHashOne = calculateLabelHash("chip1");

      const manufacturerValidationOne = {
        enrollmentId: developerChipsEnrollmentId,
        manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address, enrollmentAuthModel.address),
        payload: "0x",
      } as ManufacturerValidationInfo;

      const chipIdTwo = chipTwo.address;
      const nameHashTwo = calculateLabelHash("chip2");

      const manufacturerValidationTwo = {
        enrollmentId: developerChipsEnrollmentId,
        manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipTwo.address, enrollmentAuthModel.address),
        payload: "0x",
      } as ManufacturerValidationInfo;

      subjectAdditionData = [
        {
          chipId: chipIdOne,
          chipOwner: developerOne.address,
          nameHash: nameHashOne,
          manufacturerValidation: manufacturerValidationOne,
          custodyProof: await createDeveloperCustodyProof(chipOne, developerRegistrar.address, chainId, chipRegistry.address),
        } as ProjectChipAddition,
        {
          chipId: chipIdTwo,
          chipOwner: developerOne.address,
          nameHash: nameHashTwo,
          manufacturerValidation: manufacturerValidationTwo,
          custodyProof: await createMigrationProof(owner, chipTwo.address, chainId, chipRegistry.address),
        } as ProjectChipAddition,
      ];
      subjectCaller = developerOne;
    });

    async function subject(): Promise<any> {
      return projectRegistrar.connect(subjectCaller.wallet).addChips(subjectAdditionData);
    }

    it("should add chips", async() => {
      await subject();
      // Recreate node which hash(subjectNameHash,node(projectName))
      const recreatedNodeOne = calculateSubnodeHash("chip1.ProjectX.Gucci.ers");
      const recreatedNodeTwo = calculateSubnodeHash("chip2.ProjectX.Gucci.ers");

      expect(await ersRegistry.getOwner(recreatedNodeOne)).to.be.equal(subjectCaller.address);
      expect(await ersRegistry.getResolver(recreatedNodeOne)).to.be.equal(servicesRegistry.address);
      expect(await ersRegistry.getOwner(recreatedNodeTwo)).to.be.equal(subjectCaller.address);
      expect(await ersRegistry.getResolver(recreatedNodeTwo)).to.be.equal(servicesRegistry.address);
    });

    describe("when the caller is not the contract owner", async () => {
      beforeEach(async() => {
        subjectCaller = owner;
      });

      it("should revert", async() => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  context("when chips have been added", async() => {
    beforeEach(async () => {
      const chipIdOne = chipOne.address;
      const nameHashOne = calculateLabelHash("chip1");

      const manufacturerValidationOne = {
        enrollmentId: developerChipsEnrollmentId,
        manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address, manufacturerRegistry.address),
      } as ManufacturerValidationInfo;

      const chipIdTwo = chipTwo.address;
      const nameHashTwo = calculateLabelHash("chip2");

      const manufacturerValidationTwo = {
        enrollmentId: developerChipsEnrollmentId,
        manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipTwo.address, manufacturerRegistry.address),
      } as ManufacturerValidationInfo;

      const additionData = [
        {
          chipId: chipIdOne,
          chipOwner: developerOne.address,
          nameHash: nameHashOne,
          manufacturerValidation: manufacturerValidationOne,
          custodyProof: await createDeveloperCustodyProof(chipOne, developerRegistrar.address, chainId, chipRegistry.address),
        } as ProjectChipAddition,
        {
          chipId: chipIdTwo,
          chipOwner: developerOne.address,
          nameHash: nameHashTwo,
          manufacturerValidation: manufacturerValidationTwo,
          custodyProof: await createMigrationProof(owner, chipTwo.address, chainId, chipRegistry.address),
        } as ProjectChipAddition,
      ];

      await projectRegistrar.connect(developerOne.wallet).addChips(additionData);
    });

    describe("#transferToken", async () => {
      let subjectChipId: Address;
      let subjectSignatureFromChip: string;
      let subjectBlockNumberUsedInSig: BigNumber;
      let subjectUseSafeTranfer: boolean;
      let subjectPayload: Uint8Array;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectChipId = chipOne.address;
        const anchorBlock = await ethers.provider.getBlock('latest');

        subjectBlockNumberUsedInSig = BigNumber.from(anchorBlock.number);
        subjectUseSafeTranfer = false;

        subjectPayload = ethers.utils.zeroPad(subjectBlockNumberUsedInSig.toHexString(), 32);
        subjectCaller = developerTwo;
        const msgContents = ethers.utils.solidityPack(
          ["address", "bytes32", "bytes"],
          [subjectCaller.address, anchorBlock.hash, subjectPayload]
        );

        subjectSignatureFromChip = await chipOne.wallet.signMessage(ethers.utils.arrayify(msgContents));
      });

      async function subject(): Promise<any> {
        return projectRegistrar.connect(subjectCaller.wallet).transferToken(
          subjectChipId,
          subjectSignatureFromChip,
          subjectBlockNumberUsedInSig,
          subjectUseSafeTranfer,
          subjectPayload
        );
      }

      it("should transfer the token", async() => {
        await subject();

        expect(await projectRegistrar["ownerOf(address)"](chipOne.address)).to.be.equal(subjectCaller.address);
      });

      it("should set the new address as the owner in the ERSRegistry", async() => {
        await subject();

        const actualNewOwner = await ersRegistry.getOwner(calculateSubnodeHash("chip1.ProjectX.Gucci.ers"));

        expect(actualNewOwner).to.be.equal(subjectCaller.address);
      });
    });

    describe("#setOwner", async () => {
      let subjectChipId: Address;
      let subjectNewOwner: Address;
      let subjectCommitBlock: BigNumber;
      let subjectSignature: string;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectChipId = chipOne.address;
        subjectNewOwner = developerTwo.address;
        subjectCommitBlock = await blockchain.getLatestBlockNumber();
        subjectCaller = developerOne;
        const msgContents = ethers.utils.solidityPack(
          ["uint256", "address"],
          [subjectCommitBlock, subjectNewOwner]
        );

        subjectSignature = await chipOne.wallet.signMessage(ethers.utils.arrayify(msgContents));
      });

      async function subject(): Promise<any> {
        return projectRegistrar.connect(subjectCaller.wallet).setOwner(
          subjectChipId,
          subjectNewOwner,
          subjectCommitBlock,
          subjectSignature
        );
      }

      it("should transfer the PBT to the new address", async() => {
        await subject();

        const actualNewOwner = await projectRegistrar["ownerOf(address)"](chipOne.address);

        expect(actualNewOwner).to.be.equal(subjectNewOwner);
      });

      it("should set the new address as the owner in the ERSRegistry", async() => {
        await subject();

        const actualNewOwner = await ersRegistry.getOwner(calculateSubnodeHash("chip1.ProjectX.Gucci.ers"));

        expect(actualNewOwner).to.be.equal(subjectNewOwner);
      });
    });
  });

  describe("#setRootNode", async () => {
    let subjectRootNode: string;
    let subjectCaller:Account;

    beforeEach(async () => {
      // Deploy new project registrar with the fake Developer Registrar as the set Developer Registrar
      // This is done so we can call setRootNode externally
      projectRegistrar = await deployer.deployPBTSimpleProjectRegistrar(
        chipRegistry.address,
        ersRegistry.address,
        fakeDeveloperRegistrar.address,
        "ProjectX",
        "PRX",
        "https://api.projectx.com/",
        BigNumber.from(5),
        transferPolicy.address
      );
      subjectCaller = fakeDeveloperRegistrar;
      subjectRootNode = ethers.utils.formatBytes32String("SomethingElse");
    });

    async function subject(): Promise<any> {
      return projectRegistrar.connect(subjectCaller.wallet).setRootNode(subjectRootNode);
    }

    it("should change the rootNode", async() => {
      await subject();
      expect(await projectRegistrar.rootNode()).to.be.equal(subjectRootNode);
    });

    it("should emit a RootNodeSet event", async () => {
      await expect(await subject()).to.emit(projectRegistrar, "RootNodeSet").withArgs(
        subjectRootNode
      );
    });

    describe("when rootNode has already been set", async() => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert",  async() => {
        await expect(subject()).to.be.revertedWith("Root node already set");
      });
    });

    describe("setRootNode reverts when the caller is not the Developer Registrar contract", async() => {
      beforeEach(async () => {
        // Any Account should cause a revert as long as it isn't the fakeDeveloperRegistrar
        subjectCaller = projectManager;
      });

      it("should revert",  async() => {
        await expect(subject()).to.be.revertedWith("onlyDeveloperRegistrar: Only the contract's Developer Registrar can call this function");
      });
    });
  });

  describe("#setTransferPolcy", async () => {
    let subjectNewPolicy: Address;
    let subjectCaller:Account;

    beforeEach(async () => {
      subjectNewPolicy = newTransferPolicy.address;
      subjectCaller = developerOne;
    });

    async function subject(): Promise<any> {
      return projectRegistrar.connect(subjectCaller.wallet).setTransferPolicy(subjectNewPolicy);
    }

    it("should change the transfer policy", async() => {
      await subject();
      expect(await projectRegistrar.transferPolicy()).to.be.equal(subjectNewPolicy);
    });

    it("should emit a TransferPolicyChanged event", async () => {
      await expect(await subject()).to.emit(projectRegistrar, "TransferPolicyChanged").withArgs(
        subjectNewPolicy
      );
    });

    describe("setRootNode reverts when the caller is not the Developer Registrar contract", async() => {
      beforeEach(async () => {
        // Any Account should cause a revert as long as it isn't the fakeDeveloperRegistrar
        subjectCaller = projectManager;
      });

      it("should revert",  async() => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#transferTokenWithChip", async () => {
    let subjectSignatureFromChip: string;
    let subjectBlockNumberUsedInSig: BigNumber;
    let subjectUseSafeTranfer: boolean;
    let subjectCaller:Account;

    beforeEach(async () => {
      subjectSignatureFromChip = "0x";
      subjectBlockNumberUsedInSig = BigNumber.from(0);
      subjectUseSafeTranfer = false;
      subjectCaller = developerOne;
    });

    async function subject(): Promise<any> {
      return projectRegistrar.connect(subjectCaller.wallet).transferTokenWithChip(
        subjectSignatureFromChip,
        subjectBlockNumberUsedInSig,
        subjectUseSafeTranfer
      );
    }

    it("should revert",  async() => {
      await expect(subject()).to.be.revertedWith("Not implemented");
    });
  });

  describe("#supportsInterface", async () => {
    let subjectInterfaceId: string;

    let interfaceIdGetter: InterfaceIdGetterMock;

    beforeEach(async () => {
      interfaceIdGetter = await deployer.mocks.deployInterfaceIdGetterMock();

      subjectInterfaceId = await interfaceIdGetter.getProjectRegistrarInterfaceId();
    });

    async function subject(): Promise<any> {
      return projectRegistrar.supportsInterface(subjectInterfaceId);
    }

    it("should return true",  async() => {
      const isInterfaceSupported = await subject();

      expect(isInterfaceSupported).to.be.true;
    });

    describe("when the interface is the IPBT interface", async() => {
      beforeEach(async () => {
        subjectInterfaceId = await interfaceIdGetter.getPBTInterfaceId();
      });

      it("should return true",  async() => {
        const isInterfaceSupported = await subject();

        expect(isInterfaceSupported).to.be.true;
      });
    });

    describe("when the interface is the IChipRegistry interface", async() => {
      beforeEach(async () => {
        subjectInterfaceId = await interfaceIdGetter.getChipRegistryInterfaceId();
      });

      it("should return false",  async() => {
        const isInterfaceSupported = await subject();

        expect(isInterfaceSupported).to.be.false;
      });
    });
  });
});
