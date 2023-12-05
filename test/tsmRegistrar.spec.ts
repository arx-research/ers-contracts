import "module-alias/register";

import { ethers } from "hardhat";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ChipRegistry,
  ERSRegistry,
  ProjectRegistrarMock,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistry
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

describe("DeveloperRegistrar", () => {
  let owner: Account;
  let developerOne: Account;
  let ersRegistry: ERSRegistry;
  let developerRegistry: DeveloperRegistry;
  let chipRegistry: ChipRegistry;
  let developerRegistrar: DeveloperRegistrar;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let fakeDeveloperRegistry: Account;
  let manufacturerRegistry: Account;
  let servicesRegistry: Account;
  let projectRegistrar: ProjectRegistrarMock;
  let deployer: DeployHelper;

  const blockchain = new Blockchain(ethers.provider);

  beforeEach(async () => {
    [
      owner,
      developerOne,
      manufacturerRegistry,
      servicesRegistry,
      fakeDeveloperRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    developerRegistry = await deployer.deployDeveloperRegistry(owner.address);
    chipRegistry = await deployer.deployChipRegistry(manufacturerRegistry.address);
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistry.address
    );
    await developerRegistry.initialize(ersRegistry.address, [developerRegistrarFactory.address]);

    await chipRegistry.initialize(ersRegistry.address, servicesRegistry.address, developerRegistry.address);

    projectRegistrar = await deployer.mocks.deployProjectRegistrarMock(
      chipRegistry.address,
      ersRegistry.address
    );

    await developerRegistry.addAllowedDeveloper(developerOne.address, calculateLabelHash("gucci"));
    await developerRegistry.connect(developerOne.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    let subjectOwner: Address;
    let subjectChipRegistry: Address;
    let subjectErsRegistry: Address;
    let subjectDeveloperRegistry: Address;

    beforeEach(async () => {
      subjectOwner = developerOne.address;
      subjectChipRegistry = chipRegistry.address;
      subjectErsRegistry = ersRegistry.address;
      subjectDeveloperRegistry = developerRegistry.address;
    });

    async function subject(): Promise<any> {
      return await deployer.deployDeveloperRegistrar(
        subjectOwner,
        subjectChipRegistry,
        subjectErsRegistry,
        subjectDeveloperRegistry
      );
    }

    it("should set the correct initial state", async () => {
      developerRegistrar = await subject();

      const actualOwner = await developerRegistrar.owner();
      const actualChipRegistry = await developerRegistrar.chipRegistry();
      const actualErsRegistry = await developerRegistrar.ers();
      const actualDeveloperRegistry = await developerRegistrar.developerRegistry();

      expect(actualOwner).to.eq(developerOne.address);
      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
    });
  });

  describe("#initialize", async () => {
    let subjectRootNode: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      developerRegistrar = await deployer.deployDeveloperRegistrar(
        developerOne.address,
        chipRegistry.address,
        ersRegistry.address,
        fakeDeveloperRegistry.address
      );

      subjectRootNode = calculateSubnodeHash("gucci.ers");
      subjectCaller = fakeDeveloperRegistry;
    });

    async function subject(): Promise<any> {
      return developerRegistrar.connect(subjectCaller.wallet).initialize(subjectRootNode);
    }

    it("should initialize rootNode and set contract to initialized", async () => {
      await subject();

      const actualRootNode = await developerRegistrar.rootNode();
      const isInitialized = await developerRegistrar.initialized();

      expect(actualRootNode).to.eq(subjectRootNode);
      expect(isInitialized).to.be.true;
    });

    it("should emit the correct RegistrarInitialized event", async () => {
      await expect(subject()).to.emit(developerRegistrar, "RegistrarInitialized").withArgs(subjectRootNode);
    });

    describe("when the contract is already initialized", async () => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Contract already initialized");
      });
    });

    describe("when the caller is not the Developer registry", async () => {
      beforeEach(async () => {
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be DeveloperRegistry");
      });
    });
  });

  describe("#addProject", async () => {
    let subjectNameHash: string;
    let subjectProjectRegistrar: Address;
    let subjectMerkleRoot: string;
    let subjectProjectPublicKey: Address;
    let subjectTransferPolicy: Address;
    let subjectProjectOwnershipProof: string;
    let subjectProjectClaimDataUri: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

      subjectNameHash = calculateLabelHash("ProjectX");
      subjectProjectRegistrar = projectRegistrar.address;
      subjectMerkleRoot = ethers.utils.formatBytes32String("MerkleRoot");
      subjectProjectPublicKey = developerOne.address;
      subjectTransferPolicy = ADDRESS_ZERO;
      subjectProjectOwnershipProof = await createProjectOwnershipProof(
        developerOne,
        subjectProjectRegistrar,
        chipRegistry.address,
        await blockchain.getChainId()
      );
      subjectProjectClaimDataUri = "ipfs://QmQmQmQmQmQmQmQmQmQmQmQmQmQmQm";
      subjectCaller = developerOne;
    });

    async function subject(): Promise<any> {
      return developerRegistrar.connect(subjectCaller.wallet).addProject(
        subjectNameHash,
        subjectProjectRegistrar,
        subjectMerkleRoot,
        subjectProjectPublicKey,
        subjectTransferPolicy,
        subjectProjectOwnershipProof,
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

      const actualProjects = await developerRegistrar.getProjects();
      expect(actualProjects).to.contain(subjectProjectRegistrar);
    });

    it("should emit the correct ProjectAdded event", async () => {
      await expect(subject()).to.emit(developerRegistrar, "ProjectAdded").withArgs(
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

    describe("when the caller is not the DeveloperRegistrar owner", async () => {
      beforeEach(async () => {
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
