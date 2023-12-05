import "module-alias/register";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  ManufacturerValidationInfo,
  ServiceRecord,
  DeveloperClaimTreeInfo,
  DeveloperMerkleProofInfo
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  AuthenticityProjectRegistrar,
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
  createChipOwnershipProof,
  createDeveloperCustodyProof,
  createDeveloperInclusionProof,
  createProjectOwnershipProof
} from "@utils/protocolUtils";
import { ManufacturerTree, DeveloperTree } from "@utils/common";

import { Blockchain } from "@utils/common";

const expect = getWaffleExpect();

describe("AuthenticityProjectRegistrar", () => {
  let owner: Account;
  let developerOne: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let projectManager: Account;
  let authModel: Account;
  let fakeDeveloperRegistrar: Account;

  let projectRegistrar: AuthenticityProjectRegistrar;
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
  let projectClaimDataUri: string;

  let chainId: number;

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
      fakeDeveloperRegistrar,
      transferPolicy,
    ] = await getAccounts();
    deployer = new DeployHelper(owner.wallet);

    chainId = await blockchain.getChainId();

    // Example Developer Data
    developerNameHash = calculateLabelHash("Gucci");
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
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

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

    // 14. Deploy project registrar
    projectRegistrar = await deployer.deployAuthenticityProjectRegistrar(
      projectManager.address,
      chipRegistry.address,
      ersRegistry.address,
      developerRegistrar.address
    );

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

    // Example project data
    projectNameHash = calculateLabelHash("ProjectX");
    projectMerkleRoot = projectMerkleTree.getRoot();
    projectOwnerPublicKey = developerOne.address;
    projectOwnershipProof = await createProjectOwnershipProof(developerOne, projectRegistrar.address, chainId);
    projectClaimDataUri = "https://ipfs.io/ipfs/bafybeiezeds576kygarlq672cnjtimbsrspx5b3tr3gct2lhqud6abjgiu";

    // Call Developer Registrar to add project
    await developerRegistrar
      .connect(developerOne.wallet)
      .addProject(
        projectNameHash,
        projectRegistrar.address,
        projectMerkleRoot,
        projectOwnerPublicKey,
        transferPolicy.address,
        projectOwnershipProof,
        projectClaimDataUri
      );

  });

  describe("#constructor", async() => {
    it("should set the state correctly", async () => {
      const actualOwner = await projectRegistrar.owner();
      const actualChipRegistry = await projectRegistrar.chipRegistry();
      const actualERSRegistry = await projectRegistrar.ers();
      const actualDeveloperRegistrar = await projectRegistrar.developerRegistrar();
      const actualMaxBlockWindow = await projectRegistrar.maxBlockWindow();

      expect(actualOwner).to.eq(projectManager.address);
      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualERSRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistrar).to.eq(developerRegistrar.address);
      expect(actualMaxBlockWindow).to.eq(maxBlockWindow);
    });
  });

  describe("#claimChip", async() => {
    let subjectChipId: string;
    let subjectNameHash: string;
    let subjectChipClaim: DeveloperMerkleProofInfo;
    let subjectManufacturerValidation: ManufacturerValidationInfo;
    let subjectCommitBlock: BigNumber;
    let subjectChipOwnershipProof: string;
    let subjectDeveloperInclusionProof: string;
    let subjectDeveloperCustodyProof: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectChipId = chipOne.address;
      subjectNameHash = calculateLabelHash("chip1");
      subjectChipClaim = {
        developerIndex: ZERO,
        serviceId,
        lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
        tokenUri: developerClaimTokenURI,
        developerProof: projectMerkleTree.getProof(0),
      } as DeveloperMerkleProofInfo,

      subjectManufacturerValidation = {
        enrollmentId: developerChipsEnrollmentId,
        mIndex: ZERO,
        manufacturerProof: manufacturerEnrollmentMerkleTree.getProof(0),
      };

      subjectCommitBlock = await blockchain.getLatestBlockNumber();

      subjectDeveloperInclusionProof = await createDeveloperInclusionProof(developerOne, chipOne.address);
      subjectDeveloperCustodyProof = await createDeveloperCustodyProof(chipOne, developerOne.address);
      subjectCaller = owner;
      subjectChipOwnershipProof = await createChipOwnershipProof(
        chipOne,
        chainId,
        subjectCommitBlock,
        subjectNameHash,
        subjectCaller.address
      );
    });

    async function subject(): Promise<any> {
      return projectRegistrar.connect(subjectCaller.wallet).claimChip(
        subjectChipId,
        subjectNameHash,
        subjectChipClaim,
        subjectManufacturerValidation,
        subjectCommitBlock,
        subjectChipOwnershipProof,
        subjectDeveloperInclusionProof,
        subjectDeveloperCustodyProof
      );
    }

    it("should claim chips", async() => {
      await subject();
      // Recreate node which hash(subjectNameHash,node(projectName))
      const recreatedNode = calculateSubnodeHash("chip1.ProjectX.Gucci.ers");

      expect(await ersRegistry.getOwner(recreatedNode)).to.be.equal(owner.address);
      expect(await ersRegistry.getResolver(recreatedNode)).to.be.equal(subjectChipId);
    });


    it("should pass the expected valued to chipRegistry.claimChip", async() => {
      await subject();

      expect(await chipRegistry.chipId()).to.be.equal(subjectChipId);
      expect(await chipRegistry.developerInclusionProof()).to.be.equal(subjectDeveloperInclusionProof);
      expect(await chipRegistry.developerCustodyProof()).to.be.equal(subjectDeveloperCustodyProof);
    });

    describe("when caller is the chip", async () => {
      beforeEach(async() => {
        subjectCaller = chipOne;
      });

      it("should revert", async() => {
        await expect(subject()).to.be.revertedWith("Chip cannot own itself");
      });
    });

    describe("claimChip will revert if the ownership proof passed has an invalid signature", async () => {
      beforeEach(async() => {
        subjectChipOwnershipProof = await createChipOwnershipProof(
          owner,
          chainId,
          subjectCommitBlock,
          subjectNameHash,
          chipTwo.address
        );
      });

      it("should revert", async() => {
        await expect(subject()).to.be.revertedWith("Invalid signature");
      });
    });

    describe("claimChip will revert if wrong chainId is used", async () => {
      beforeEach(async() => {
        const badChainId = 1000;
        subjectChipOwnershipProof = await createChipOwnershipProof(
          chipOne,
          badChainId,
          subjectCommitBlock,
          subjectNameHash,
          chipTwo.address
        );
      });

      it("should revert", async() => {
        await expect(subject()).to.be.revertedWith("Invalid signature");
      });
    });

    describe("claimChip will revert if the ownership proof has expired", async () => {
      beforeEach(async() => {
        await blockchain.waitBlocksAsync(6);
      });

      it("should revert", async() => {
        await expect(subject()).to.be.revertedWith("Signature expired");
      });
    });
  });

  describe("#setRootNode", async () => {
    let subjectRootNode: string;
    let subjectCaller:Account;

    beforeEach(async () => {
      // Deploy new project registrar with the fake Developer Registrar as the set Developer Registrar
      // This is done so we can call setRootNode externally
      projectRegistrar = await deployer.deployAuthenticityProjectRegistrar(
        projectManager.address,
        chipRegistry.address,
        ersRegistry.address,
        fakeDeveloperRegistrar.address
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

    describe("setRootNode reverts when the caller is not the Developer Registrar contract", async() => {
      beforeEach(() => {
        // Any Account should cause a revert as long as it isn't the fakeDeveloperRegistrar
        subjectCaller = projectManager;
      });

      it("should revert",  async() => {
        await expect(subject()).to.be.revertedWith("onlyDeveloperRegistrar: Only the contract's Developer Registrar can call this function");
      });
    });

  });
});
