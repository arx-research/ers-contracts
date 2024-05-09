import "module-alias/register";

import { ethers } from "hardhat";

import {
  ManufacturerValidationInfo,
  ProjectChipAddition,
  ServiceRecord
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  PBTSimpleProjectRegistrar,
  ERSRegistry,
  ManufacturerRegistry,
  ServicesRegistry,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistry,
  ChipRegistryMock
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

describe("PBTSimpleProjectRegistrar", () => {
  let owner: Account;
  let developerOne: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let projectManager: Account;
  let authModel: Account;
  let fakeDeveloperRegistrar: Account;

  let projectRegistrar: PBTSimpleProjectRegistrar;
  let manufacturerRegistry: ManufacturerRegistry;
  let ersRegistry: ERSRegistry;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let developerRegistry: DeveloperRegistry;
  let servicesRegistry: ServicesRegistry;

  // Chip Registry Mock is used to be able to test the arguments passed to ChipRegistry.claimChip
  let chipRegistry: ChipRegistryMock;
  let transferPolicy: Account;
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
      manufacturerOne,
      chipOne,
      chipTwo,
      projectManager,
      authModel,
      fakeDeveloperRegistrar,
      transferPolicy,
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
        manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address),
      } as ManufacturerValidationInfo;

      const chipIdTwo = chipTwo.address;
      const nameHashTwo = calculateLabelHash("chip2");

      const manufacturerValidationTwo = {
        enrollmentId: developerChipsEnrollmentId,
        manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipTwo.address),
      } as ManufacturerValidationInfo;

      subjectAdditionData = [
        {
          chipId: chipIdOne,
          chipOwner: developerOne.address,
          nameHash: nameHashOne,
          manufacturerValidation: manufacturerValidationOne,
          custodyProof: await createDeveloperCustodyProof(chipOne, developerOne.address),
        } as ProjectChipAddition,
        {
          chipId: chipIdTwo,
          chipOwner: developerOne.address,
          nameHash: nameHashTwo,
          manufacturerValidation: manufacturerValidationTwo,
          custodyProof: await createMigrationProof(owner, chipTwo.address),
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
});
