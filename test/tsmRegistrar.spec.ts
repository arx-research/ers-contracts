import "module-alias/register";

import { ethers } from "hardhat";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ChipRegistry,
  ERSRegistry,
  ProjectRegistrarMock,
  TSMRegistrar,
  TSMRegistrarFactory,
  TSMRegistry
} from "@utils/contracts";
import { ADDRESS_ZERO, NULL_NODE } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import { calculateLabelHash, calculateSubnodeHash, createProjectOwnershipProof } from "../utils/protocolUtils";
import { Blockchain } from "../utils/common";

const expect = getWaffleExpect();

describe("TSMRegistrar", () => {
  let owner: Account;
  let tsmOne: Account;
  let ersRegistry: ERSRegistry;
  let tsmRegistry: TSMRegistry;
  let chipRegistry: ChipRegistry;
  let tsmRegistrar: TSMRegistrar;
  let tsmRegistrarFactory: TSMRegistrarFactory;
  let fakeTSMRegistry: Account;
  let manufacturerRegistry: Account;
  let servicesRegistry: Account;
  let projectRegistrar: ProjectRegistrarMock;
  let deployer: DeployHelper;

  const blockchain = new Blockchain(ethers.provider);

  beforeEach(async () => {
    [
      owner,
      tsmOne,
      manufacturerRegistry,
      servicesRegistry,
      fakeTSMRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    tsmRegistry = await deployer.deployTSMRegistry(owner.address);
    chipRegistry = await deployer.deployChipRegistry(manufacturerRegistry.address);
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, tsmRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), tsmRegistry.address, tsmRegistry.address);

    tsmRegistrarFactory = await deployer.deployTSMRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      tsmRegistry.address
    );
    await tsmRegistry.initialize(ersRegistry.address, [tsmRegistrarFactory.address]);

    await chipRegistry.initialize(ersRegistry.address, servicesRegistry.address, tsmRegistry.address);

    projectRegistrar = await deployer.mocks.deployProjectRegistrarMock(
      chipRegistry.address,
      ersRegistry.address
    );

    await tsmRegistry.addAllowedTSM(tsmOne.address, calculateLabelHash("gucci"));
    await tsmRegistry.connect(tsmOne.wallet).createNewTSMRegistrar(tsmRegistrarFactory.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    let subjectOwner: Address;
    let subjectChipRegistry: Address;
    let subjectErsRegistry: Address;
    let subjectTsmRegistry: Address;

    beforeEach(async () => {
      subjectOwner = tsmOne.address;
      subjectChipRegistry = chipRegistry.address;
      subjectErsRegistry = ersRegistry.address;
      subjectTsmRegistry = tsmRegistry.address;
    });

    async function subject(): Promise<any> {
      return await deployer.deployTSMRegistrar(
        subjectOwner,
        subjectChipRegistry,
        subjectErsRegistry,
        subjectTsmRegistry
      );
    }

    it("should set the correct initial state", async () => {
      tsmRegistrar = await subject();

      const actualOwner = await tsmRegistrar.owner();
      const actualChipRegistry = await tsmRegistrar.chipRegistry();
      const actualErsRegistry = await tsmRegistrar.ers();
      const actualTsmRegistry = await tsmRegistrar.tsmRegistry();

      expect(actualOwner).to.eq(tsmOne.address);
      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualTsmRegistry).to.eq(tsmRegistry.address);
    });
  });

  describe("#initialize", async () => {
    let subjectRootNode: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      tsmRegistrar = await deployer.deployTSMRegistrar(
        tsmOne.address,
        chipRegistry.address,
        ersRegistry.address,
        fakeTSMRegistry.address
      );

      subjectRootNode = calculateSubnodeHash("gucci.ers");
      subjectCaller = fakeTSMRegistry;
    });

    async function subject(): Promise<any> {
      return tsmRegistrar.connect(subjectCaller.wallet).initialize(subjectRootNode);
    }

    it("should initialize rootNode and set contract to initialized", async () => {
      await subject();

      const actualRootNode = await tsmRegistrar.rootNode();
      const isInitialized = await tsmRegistrar.initialized();

      expect(actualRootNode).to.eq(subjectRootNode);
      expect(isInitialized).to.be.true;
    });

    it("should emit the correct RegistrarInitialized event", async () => {
      await expect(subject()).to.emit(tsmRegistrar, "RegistrarInitialized").withArgs(subjectRootNode);
    });

    describe("when the contract is already initialized", async () => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Contract already initialized");
      });
    });

    describe("when the caller is not the TSM registry", async () => {
      beforeEach(async () => {
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be TSMRegistry");
      });
    });
  });

  describe("#addProject", async () => {
    let subjectNameHash: string;
    let subjectProjectRegistrar: Address;
    let subjectMerkleRoot: string;
    let subjectProjectPublicKey: Address;
    let subjectTransferPolicy: Address;
    let subjectOwnershipProof: string;
    let subjectProjectClaimDataUri: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      tsmRegistrar = await deployer.getTSMRegistrar((await tsmRegistry.getTSMRegistrars())[0]);

      subjectNameHash = calculateLabelHash("ProjectX");
      subjectProjectRegistrar = projectRegistrar.address;
      subjectMerkleRoot = ethers.utils.formatBytes32String("MerkleRoot");
      subjectProjectPublicKey = tsmOne.address;
      subjectTransferPolicy = ADDRESS_ZERO;
      subjectOwnershipProof = await createProjectOwnershipProof(
        tsmOne,
        subjectProjectRegistrar,
        chipRegistry.address,
        await blockchain.getChainId()
      );
      subjectProjectClaimDataUri = "ipfs://QmQmQmQmQmQmQmQmQmQmQmQmQmQmQm";
      subjectCaller = tsmOne;
    });

    async function subject(): Promise<any> {
      return tsmRegistrar.connect(subjectCaller.wallet).addProject(
        subjectNameHash,
        subjectProjectRegistrar,
        subjectMerkleRoot,
        subjectProjectPublicKey,
        subjectTransferPolicy,
        subjectOwnershipProof,
        subjectProjectClaimDataUri
      );
    }

    it("should set the correct project state on the ChipRegistry", async () => {
      await subject();

      const actualProject = await chipRegistry.projectEnrollments(subjectProjectRegistrar);

      expect(actualProject.merkleRoot).to.eq(subjectMerkleRoot);
      expect(actualProject.projectPublicKey).to.eq(subjectProjectPublicKey);
      expect(actualProject.transferPolicy).to.eq(subjectTransferPolicy);
      expect(actualProject.projectClaimDataUri).to.eq(subjectProjectClaimDataUri);
    });

    it("should set the correct node state on the ERSRegistry", async () => {
      await subject();

      const nodeHash = calculateSubnodeHash("ProjectX.gucci.ers");
      const actualOwner = await ersRegistry.getOwner(nodeHash);
      const actualResolver = await ersRegistry.getResolver(nodeHash);

      expect(actualOwner).to.eq(subjectProjectRegistrar);
      expect(actualResolver).to.eq(subjectProjectRegistrar);
    });

    it("should add the project to the Registrar's projects array", async () => {
      await subject();

      const actualProjects = await tsmRegistrar.getProjects();
      expect(actualProjects).to.contain(subjectProjectRegistrar);
    });

    it("should emit the correct ProjectAdded event", async () => {
      await expect(subject()).to.emit(tsmRegistrar, "ProjectAdded").withArgs(
        subjectProjectRegistrar,
        calculateSubnodeHash("ProjectX.gucci.ers"),
        subjectMerkleRoot,
        subjectProjectPublicKey,
        subjectTransferPolicy,
        subjectProjectClaimDataUri
      );
    });

    describe("when the merkle root is bytes32(0)", async () => {
      beforeEach(async () => {
        subjectMerkleRoot = NULL_NODE;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid merkle root");
      });
    });

    describe("when the project public key is the zero address", async () => {
      beforeEach(async () => {
        subjectProjectPublicKey = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid project public key");
      });
    });

    describe("when the project registrar is the zero address", async () => {
      beforeEach(async () => {
        subjectProjectRegistrar = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid project registrar address");
      });
    });

    describe("when the project is already enrolled", async () => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Subnode already exists");
      });
    });

    describe("when the caller is not the TSMRegistrar owner", async () => {
      beforeEach(async () => {
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
