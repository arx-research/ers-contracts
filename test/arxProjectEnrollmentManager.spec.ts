import "module-alias/register";

import { ethers } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";
import {
  Address,
  ServiceRecord,
  DeveloperClaimTreeInfo
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ArxProjectEnrollmentManager,
  AuthenticityProjectRegistrar,
  ERSRegistry,
  ManufacturerRegistry,
  ServicesRegistry,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistry,
  ChipRegistry
} from "@utils/contracts";
import { calculateAuthenticityProjectRegistrarAddress } from "@utils/create2";
import {
  calculateEnrollmentId,
  calculateLabelHash,
  calculateSubnodeHash,
  createProjectOwnershipProof
} from "@utils/protocolUtils";
import { ADDRESS_ZERO, NULL_NODE, ZERO } from "@utils/constants";

import DeployHelper from "@utils/deploys";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import { Blockchain, ManufacturerTree, DeveloperTree } from "@utils/common";

const expect = getWaffleExpect();

describe("ArxProjectEnrollmentManager", () => {
  let owner: Account;
  let developerOne: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let projectManager: Account;
  let authModel: Account;

  let projectRegistrar: AuthenticityProjectRegistrar;
  let manufacturerRegistry: ManufacturerRegistry;
  let ersRegistry: ERSRegistry;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let developerRegistry: DeveloperRegistry;
  let servicesRegistry: ServicesRegistry;
  let arxProjectEnrollmentManager: ArxProjectEnrollmentManager;
  let transferPolicy: Account;

  let chipRegistry: ChipRegistry;
  let developerRegistrar: DeveloperRegistrar;

  let chainId: number;
  let manufacturerId: string;
  let chipRegistryGatewayURLs: string[];
  let serviceId: string;
  let serviceRecords: ServiceRecord[];
  let projectNameHash: string;
  let manufacturerEnrollmentMerkleTree: ManufacturerTree;
  let deployer: DeployHelper;
  let chipOneClaim: DeveloperClaimTreeInfo;
  let chipTwoClaim: DeveloperClaimTreeInfo;

  // Developer Data
  let developerChipsEnrollmentId: string;
  let developerClaimTokenURI: string;
  let developerNameHash: string;
  let developerClaimDataUri: string;

  // Manufacturer Chip Enrollment Data
  let manufacturerMerkleRoot: string;
  let manufacturerCertSigner: string;
  let manufacturerChipAuthModel: string;
  let manufacturerValidationUri: string;
  let manufacturerBootloaderApp: string;
  let manufacturerChipModel: string;

  // Project Chip Enrollment Data
  let projectMerkleTree: DeveloperTree;
  let projectMerkleRoot: string;
  let projectOwnerPublicKey: string;
  let projectOwnershipProof: string;

  let expectedProjectRegistrarAddress: Address;

  const blockchain = new Blockchain(ethers.provider);
  const maxBlockWindow = BigNumber.from(5);

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
      transferPolicy,
    ] = await getAccounts();
    deployer = new DeployHelper(owner.wallet);

    // Example Developer Data
    developerNameHash = calculateLabelHash("Gucci");
    developerClaimDataUri = "https://ipfs.io/ipfs/bafybeiezeds576kygarlq672cnjtimbsrspx5b3tr3gct2lhqud6abjgiu";
    developerClaimTokenURI = "https://tokenuri.com";

    // 1. Deploy example ERS system's Manufacturer Registry
    manufacturerRegistry = await deployer.deployManufacturerRegistry(owner.address);

    // 2. Add example manufacture to Manufacturer Registry
    manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
    await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

    developerChipsEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);

    // 3. Enroll chips to Manufacturer Registry under example manufacturer
    // Example Manufacturer Chip Enrollment Data
    manufacturerEnrollmentMerkleTree =  new ManufacturerTree([{ chipId: chipOne.address}, { chipId: chipTwo.address}]);
    manufacturerMerkleRoot = manufacturerEnrollmentMerkleTree.getRoot();
    manufacturerCertSigner = manufacturerOne.address;
    manufacturerChipAuthModel = authModel.address;
    manufacturerValidationUri = "ipfs://bafy";
    manufacturerBootloaderApp = "https://bootloader.app";
    manufacturerChipModel = "SuperCool ChipModel";

    // Contract function call
    await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
      manufacturerId,
      manufacturerMerkleRoot,
      manufacturerCertSigner,
      manufacturerChipAuthModel,
      manufacturerValidationUri,
      manufacturerBootloaderApp,
      manufacturerChipModel
    );

    // 4. Deploy chip registry
    chipRegistryGatewayURLs = ["www.resolve.com"];
    chipRegistry = await deployer.mocks.deployChipRegistryMock(manufacturerRegistry.address, chipRegistryGatewayURLs);

    // 5. Deploy Developer Registry
    developerRegistry = await deployer.deployDeveloperRegistry(owner.address);

    // 6. Deploy ERS Registry
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(
      NULL_NODE,
      calculateLabelHash("ers"),
      developerRegistry.address,
      developerRegistry.address
    );

    // 7. Deploy Services Registry
    servicesRegistry = await deployer.deployServicesRegistry(chipRegistry.address);

    // 8. Deploy Developer Registrar Factory
    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistry.address
    );

    // 9. Initialize Chip Registry
    await chipRegistry.connect(owner.wallet).initialize(
      ersRegistry.address,
      servicesRegistry.address,
      developerRegistry.address
    );

    // 10. Initialize Developer Registry
    await developerRegistry.connect(owner.wallet).initialize(ersRegistry.address, [developerRegistrarFactory.address]);

    // 11. Add owner as Developer
    await developerRegistry.connect(owner.wallet).addAllowedDeveloper(developerOne.address, developerNameHash);

    // 12. Deploy Developer Registrar from Developer Registry
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

    // 13. Deploy Arx Project Enrollment Manager
    arxProjectEnrollmentManager = await deployer.deployArxProjectEnrollmentManager(
      chipRegistry.address,
      developerRegistrar.address,
      ersRegistry.address,
      manufacturerRegistry.address,
      transferPolicy.address,
      maxBlockWindow
    );

    // 14. Create example service for project
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

    // 15. Add Project to ERS System

    // Create Merkle tree for project-relevant chips
    chipOneClaim = {
      chipId: chipOne.address,
      enrollmentId: developerChipsEnrollmentId,
      lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
      primaryServiceId: serviceId,
      tokenUri: developerClaimTokenURI,
    };
    chipTwoClaim = {
      chipId: chipTwo.address,
      enrollmentId: developerChipsEnrollmentId,
      lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
      primaryServiceId: serviceId,
      tokenUri: developerClaimTokenURI,
    };
    projectMerkleTree = new DeveloperTree([chipOneClaim, chipTwoClaim]);
    projectMerkleRoot = projectMerkleTree.getRoot();

    // Create expected Project Registrar address to sign
    expectedProjectRegistrarAddress = calculateAuthenticityProjectRegistrarAddress(
      arxProjectEnrollmentManager.address,
      projectMerkleRoot,
      [
        projectManager.address,
        chipRegistry.address,
        ersRegistry.address,
        developerRegistrar.address,
        maxBlockWindow,
      ]
    );

    // Example project data
    projectNameHash = calculateLabelHash("ProjectX");

    chainId = await blockchain.getChainId();
    projectOwnershipProof = await createProjectOwnershipProof(
      developerOne,
      expectedProjectRegistrarAddress,
      chipRegistry.address,
      chainId
    );
    projectOwnerPublicKey = developerOne.address;

    // Transfer ownership of developerRegistrar to Arx Project Enrollment Manager contract
    await developerRegistrar.connect(developerOne.wallet).transferOwnership(arxProjectEnrollmentManager.address);
  });

  describe("#constructor", async () => {
    it("should set all the state correctly", async () => {
      const actualChipRegistry = await arxProjectEnrollmentManager.chipRegistry();
      const actualErsRegistry = await arxProjectEnrollmentManager.ers();
      const actualDeveloperRegistrar = await arxProjectEnrollmentManager.developerRegistrar();
      const actualERS = await arxProjectEnrollmentManager.ers();
      const actualManufacturerRegistry = await arxProjectEnrollmentManager.manufacturerRegistry();
      const actualTransferPolicy = await arxProjectEnrollmentManager.transferPolicy();
      const actualMaxBlockWindow = await arxProjectEnrollmentManager.maxBlockWindow();

      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistrar).to.eq(developerRegistrar.address);
      expect(actualERS).to.eq(ersRegistry.address);
      expect(actualManufacturerRegistry).to.eq(manufacturerRegistry.address);
      expect(actualTransferPolicy).to.eq(transferPolicy.address);
      expect(actualMaxBlockWindow).to.eq(maxBlockWindow);
    });
  });

  describe("#addProject", async() => {
    let subjectProjectManager: Address;
    let subjectProjectClaimDataUri: string;
    let subjectNameHash: string;
    let subjectMerkleRoot: string;
    let subjectProjectPublicKey: string;
    let subjectProjectOwnershipProof: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectProjectManager = projectManager.address;
      subjectProjectClaimDataUri = developerClaimDataUri;
      subjectNameHash = projectNameHash;
      subjectMerkleRoot = projectMerkleRoot;

      subjectProjectPublicKey = projectOwnerPublicKey;
      subjectProjectOwnershipProof = projectOwnershipProof;
      subjectCaller = developerOne;
    });

    async function subject(): Promise<ContractTransaction> {
      return await arxProjectEnrollmentManager.connect(subjectCaller.wallet).addProject(
        subjectProjectManager,
        subjectProjectClaimDataUri,
        subjectNameHash,
        subjectMerkleRoot,
        subjectProjectPublicKey,
        subjectProjectOwnershipProof
      );
    }

    it("should set the state correctly on ProjectRegistrar", async () => {
      await subject();

      projectRegistrar = await deployer.getAuthenticityProjectRegistrar(expectedProjectRegistrarAddress);

      const actualOwner = await projectRegistrar.owner();
      const actualChipRegistry = await projectRegistrar.chipRegistry();
      const actualERSRegistry = await projectRegistrar.ers();
      const actualDeveloperRegistrar = await projectRegistrar.developerRegistrar();
      const actualRootNode = await projectRegistrar.rootNode();

      expect(actualOwner).to.eq(projectManager.address);
      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualERSRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistrar).to.eq(developerRegistrar.address);
      expect(actualRootNode).to.eq(calculateSubnodeHash("ProjectX.Gucci.ers"));
    });

    it("should set the state correctly on Developer Registrar and ChipRegistry (to show vars were passed correctly)", async () => {
      await subject();

      const actualProjects = await developerRegistrar.getProjects();
      const enrollment = await chipRegistry.projectEnrollments(expectedProjectRegistrarAddress);

      expect(actualProjects).to.include(expectedProjectRegistrarAddress);
      expect(enrollment.merkleRoot).to.eq(subjectMerkleRoot);
      expect(enrollment.projectPublicKey).to.eq(subjectProjectPublicKey);
      expect(enrollment.transferPolicy).to.eq(transferPolicy.address);
      expect(enrollment.projectClaimDataUri).to.eq(subjectProjectClaimDataUri);
    });

    it("should emit the correct ProjectRegistrarDeployed event", async () => {
      await expect(subject()).to.emit(arxProjectEnrollmentManager, "ProjectRegistrarDeployed").withArgs(
        expectedProjectRegistrarAddress,
        developerOne.address
      );
    });

    describe("when the projectManager param is the zero address", async () => {
      beforeEach(async () => {
        subjectProjectManager = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid project manager address");
      });
    });

    describe("when the projectPublicKey param is the zero address", async () => {
      beforeEach(async () => {
        subjectProjectPublicKey = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid project public key address");
      });
    });
  });

  describe("#setTransferPolicy", async () => {
    let subjectTransferPolicy: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectTransferPolicy = transferPolicy.address;
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return arxProjectEnrollmentManager.connect(subjectCaller.wallet).setTransferPolicy(subjectTransferPolicy);
    }

    it("should set the transfer policy correctly", async () => {
      await subject();

      const actualTransferPolicy = await arxProjectEnrollmentManager.transferPolicy();

      expect(actualTransferPolicy).to.eq(subjectTransferPolicy);
    });

    it("should emit the correct NewTransferPolicySet event", async () => {
      await expect(subject()).to.emit(arxProjectEnrollmentManager, "NewTransferPolicySet").withArgs(
        subjectTransferPolicy
      );
    });

    describe("when the caller is not the owner", async () => {
      beforeEach(async () => {
        subjectCaller = developerOne;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#setMaxBlockWindow", async () => {
    let subjectMaxBlockWindow: BigNumber;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectMaxBlockWindow = BigNumber.from(10);
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return arxProjectEnrollmentManager.connect(subjectCaller.wallet).setMaxBlockWindow(subjectMaxBlockWindow);
    }

    it("should set the max block window correctly", async () => {
      await subject();

      const actualBlockWindow = await arxProjectEnrollmentManager.maxBlockWindow();

      expect(actualBlockWindow).to.eq(subjectMaxBlockWindow);
    });

    it("should emit the correct NewMaxBlockWindowSet event", async () => {
      await expect(subject()).to.emit(arxProjectEnrollmentManager, "NewMaxBlockWindowSet").withArgs(
        subjectMaxBlockWindow
      );
    });

    describe("when the caller is not the owner", async () => {
      beforeEach(async () => {
        subjectCaller = developerOne;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
