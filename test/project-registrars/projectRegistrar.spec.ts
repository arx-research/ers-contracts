import "module-alias/register";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  ManufacturerValidationInfo,
  ServiceRecord,
  TSMClaimTreeInfo,
  TSMMerkleProofInfo
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ERSRegistry,
  ManufacturerRegistry,
  ProjectRegistrar,
  ServicesRegistry,
  TSMRegistrar,
  TSMRegistrarFactory,
  TSMRegistry,
  ChipRegistryMock
} from "@utils/contracts";
import { NULL_NODE, ZERO } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import { calculateEnrollmentId, calculateLabelHash, calculateSubnodeHash } from "@utils/protocolUtils";
import { ManufacturerTree, TSMTree } from "@utils/common";

import { Blockchain } from "@utils/common";

const expect = getWaffleExpect();

describe("ProjectRegistrar", () => {
  let owner: Account;
  let tsmOne: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let projectManager: Account;
  let authModel: Account;
  let fakeTSMRegistrar: Account;

  let projectRegistrar: ProjectRegistrar;
  let manufacturerRegistry: ManufacturerRegistry;
  let ersRegistry: ERSRegistry;
  let tsmRegistrarFactory: TSMRegistrarFactory;
  let tsmRegistry: TSMRegistry;
  let servicesRegistry: ServicesRegistry;

  // Chip Registry Mock is used to be able to test the arguments passed to ChipRegistry.claimChip
  let chipRegistry: ChipRegistryMock;
  let transferPolicy: Account;
  let tsmRegistrar: TSMRegistrar;


  let manufacturerId: string;
  let chipRegistryGatewayURLs: string[];
  let serviceId: string;
  let serviceRecords: ServiceRecord[];
  let projectNameHash: string;
  let manufacturerEnrollmentMerkleTree: ManufacturerTree;
  let deployer: DeployHelper;
  let chipOneClaim: TSMClaimTreeInfo;
  let chipTwoClaim: TSMClaimTreeInfo;

  // TSM Data
  let tsmChipsEnrollmentId: string;
  let tsmClaimTokenURI: string;
  let tsmNameHash: string;

  // Manufacturer Chip Enrollment Data
  let manufacturerMerkleRoot: string;
  let manufacturerCertSigner: string;
  let manufacturerChipAuthModel: string;
  let manufacturerValidationUri: string;
  let manufacturerBootloaderApp: string;
  let manufacturerChipModel: string;

  // Project Chip Enrollment Data
  let projectPackedProjectRegistarAddress: string;
  let projectMerkleTree: TSMTree;
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
      tsmOne,
      manufacturerOne,
      chipOne,
      chipTwo,
      projectManager,
      authModel,
      fakeTSMRegistrar,
      transferPolicy,
    ] = await getAccounts();
    deployer = new DeployHelper(owner.wallet);

    chainId = await blockchain.getChainId();

    // Example TSM Data
    tsmNameHash = calculateLabelHash("Gucci");
    tsmClaimTokenURI = "https://tokenuri.com";

    // 1. Deploy example ERS system's Manufacturer Registry
    manufacturerRegistry = await deployer.deployManufacturerRegistry(owner.address);

    // 2. Add example manufacture to Manufacturer Registry
    manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
    await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

    tsmChipsEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);

    // 3. Enroll chips to Manufacturer Registry under example manufacturer
    // Example Manufacturer Chip Enrollment Data
    manufacturerEnrollmentMerkleTree =  new ManufacturerTree([{ chipId: chipOne.address}, { chipId: chipTwo.address}]);
    manufacturerMerkleRoot = manufacturerEnrollmentMerkleTree.getHexRoot();
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

    // 5. Deploy TSM Registry
    tsmRegistry = await deployer.deployTSMRegistry(owner.address);

    // 6. Deploy ERS Registry
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, tsmRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), tsmRegistry.address, tsmRegistry.address);

    // 7. Deploy Services Registry
    servicesRegistry = await deployer.deployServicesRegistry(chipRegistry.address);

    // 8. Deploy TSM Registrar Factory
    tsmRegistrarFactory = await deployer.deployTSMRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      tsmRegistry.address
    );

    // 9. Initialize Chip Registry
    await chipRegistry.connect(owner.wallet).initialize(
      ersRegistry.address,
      servicesRegistry.address,
      tsmRegistry.address
    );

    // 10. Initialize TSM Registry
    await tsmRegistry.connect(owner.wallet).initialize(ersRegistry.address, [tsmRegistrarFactory.address]);

    // 12. Add owner as TSM
    await tsmRegistry.connect(owner.wallet).addAllowedTSM(tsmOne.address, tsmNameHash);

    // 13. Deploy TSM Registrar from TSM Registry
    // TSM Registry checks if it's initialized when createNewTSMRegistrar is called
    // by checking the factory address & ers registry address

    // Simulate call to retrieve expected TSM Registrar address
    const expectedRegistrarAddress = await tsmRegistry
      .connect(tsmOne.wallet)
      .callStatic.createNewTSMRegistrar(tsmRegistrarFactory.address);

    // Actual contract call
    await tsmRegistry
      .connect(tsmOne.wallet)
      .createNewTSMRegistrar(tsmRegistrarFactory.address);

    // Create TSM Registrar object
    tsmRegistrar = await deployer.getTSMRegistrar(expectedRegistrarAddress);

    // 14. Deploy project registrar
    projectRegistrar = await deployer.deployProjectRegistrar(
      projectManager.address,
      chipRegistry.address,
      ersRegistry.address,
      tsmRegistrar.address
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
        recordType: ethers.utils.formatBytes32String("contentApp"),
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
      enrollmentId: tsmChipsEnrollmentId,
      lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
      primaryServiceId: serviceId,
      tokenUri: tsmClaimTokenURI,
    };
    chipTwoClaim = {
      chipId: chipTwo.address,
      enrollmentId: tsmChipsEnrollmentId,
      lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
      primaryServiceId: serviceId,
      tokenUri: tsmClaimTokenURI,
    };
    projectMerkleTree = new TSMTree([chipOneClaim, chipTwoClaim]);

    // Example project data
    projectNameHash = calculateLabelHash("ProjectX");
    projectPackedProjectRegistarAddress = ethers.utils.solidityPack(["uint256", "address"], [chainId, projectRegistrar.address]);
    projectMerkleRoot = projectMerkleTree.getHexRoot();
    projectOwnerPublicKey = tsmOne.address;
    projectOwnershipProof = await tsmOne.wallet.signMessage(ethers.utils.arrayify(projectPackedProjectRegistarAddress));
    projectClaimDataUri = "https://ipfs.io/ipfs/bafybeiezeds576kygarlq672cnjtimbsrspx5b3tr3gct2lhqud6abjgiu";

    // Call TSM Registrar to add project
    await tsmRegistrar
      .connect(tsmOne.wallet)
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
      const actualTSMRegistrar = await projectRegistrar.tsmRegistrar();
      const actualMaxBlockWindow = await projectRegistrar.maxBlockWindow();

      expect(actualOwner).to.eq(projectManager.address);
      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualERSRegistry).to.eq(ersRegistry.address);
      expect(actualTSMRegistrar).to.eq(tsmRegistrar.address);
      expect(actualMaxBlockWindow).to.eq(maxBlockWindow);
    });
  });

  describe("#claimChip", async() => {
    let subjectChipId: string;
    let subjectNameHash: string;
    let subjectChipClaim: TSMMerkleProofInfo;
    let subjectManufacturerValidation: ManufacturerValidationInfo;
    let subjectCommitBlock: BigNumber;
    let subjectOwnershipProof: string;
    let subjectTSMCertificate: string;
    let subjectCustodyProof: string;
    let subjectCaller: Account;

    let packedOwnershipProof: string;

    beforeEach(async () => {
      subjectChipId = chipOne.address;
      subjectNameHash = calculateLabelHash("chip1");
      subjectChipClaim = {
        tsmIndex: ZERO,
        serviceId,
        lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
        tokenUri: tsmClaimTokenURI,
        tsmProof: projectMerkleTree.getProof(ZERO, chipOneClaim),
      } as TSMMerkleProofInfo,

      subjectManufacturerValidation = {
        enrollmentId: tsmChipsEnrollmentId,
        mIndex: ZERO,
        manufacturerProof: manufacturerEnrollmentMerkleTree.getProof(ZERO, chipOne.address),
      };

      subjectCommitBlock = await blockchain.getLatestBlockNumber();

      const packedTSMCert = ethers.utils.solidityPack(["address"], [chipOne.address]);
      subjectTSMCertificate = await tsmOne.wallet.signMessage(ethers.utils.arrayify(packedTSMCert));

      const packedCustodyProof = ethers.utils.solidityPack(["address"], [tsmOne.address]);
      subjectCustodyProof = await chipOne.wallet.signMessage(ethers.utils.arrayify(packedCustodyProof));
      subjectCaller = owner;

      packedOwnershipProof = ethers.utils.solidityPack(
        ["uint256", "uint256", "bytes32", "address"],
        [chainId, subjectCommitBlock, subjectNameHash, subjectCaller.address]
      );
      subjectOwnershipProof = await chipOne.wallet.signMessage(ethers.utils.arrayify(packedOwnershipProof));
    });

    async function subject(): Promise<any> {
      return projectRegistrar.connect(subjectCaller.wallet).claimChip(
        subjectChipId,
        subjectNameHash,
        subjectChipClaim,
        subjectManufacturerValidation,
        subjectCommitBlock,
        subjectOwnershipProof,
        subjectTSMCertificate,
        subjectCustodyProof
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
      expect(await chipRegistry.tsmCertificate()).to.be.equal(subjectTSMCertificate);
      expect(await chipRegistry.signedCert()).to.be.equal(subjectCustodyProof);
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
        subjectOwnershipProof = await owner.wallet.signMessage(ethers.utils.arrayify(packedOwnershipProof));
      });

      it("should revert", async() => {
        await expect(subject()).to.be.revertedWith("Invalid signature");
      });
    });

    describe("claimChip will revert if wrong chainId is used", async () => {
      beforeEach(async() => {
        const badChainId = 1000;
        packedOwnershipProof = ethers.utils.solidityPack(
          ["uint256", "uint256", "bytes32"],
          [badChainId, subjectCommitBlock, subjectNameHash]
        );
        subjectOwnershipProof = await chipOne.wallet.signMessage(ethers.utils.arrayify(packedOwnershipProof));
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
      // Deploy new project registrar with the fake TSM Registrar as the set TSM Registrar
      // This is done so we can call setRootNode externally
      projectRegistrar = await deployer.deployProjectRegistrar(
        projectManager.address,
        chipRegistry.address,
        ersRegistry.address,
        fakeTSMRegistrar.address
      );
      subjectCaller = fakeTSMRegistrar;
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

    describe("setRootNode reverts when the caller is not the TSM Registrar contract", async() => {
      beforeEach(() => {
        // Any Account should cause a revert as long as it isn't the fakeTSMRegistrar
        subjectCaller = projectManager;
      });

      it("should revert",  async() => {
        await expect(subject()).to.be.revertedWith("onlyTSMRegistrar: Only the contract's TSM Registrar can call this function");
      });
    });

  });
});
