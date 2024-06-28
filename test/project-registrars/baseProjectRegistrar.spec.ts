import "module-alias/register";

import { ethers } from "hardhat";

import { Account } from "@utils/test/types";
import {
  BaseProjectRegistrar,
  InterfaceIdGetterMock
} from "@utils/contracts";
import DeployHelper from "@utils/deploys";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

const expect = getWaffleExpect();

describe("BaseProjectRegistrar", () => {
  let owner: Account;
  let developerOne: Account;
  let projectManager: Account;
  let fakeDeveloperRegistrar: Account;

  let projectRegistrar: BaseProjectRegistrar;
  let ersRegistry: Account;

  // Chip Registry Mock is used to be able to test the arguments passed to ChipRegistry.claimChip
  let chipRegistry: Account;

  let deployer: DeployHelper;

  beforeEach(async () => {
    // Environment set up
    [
      owner,
      developerOne,
      projectManager,
      chipRegistry,
      ersRegistry,
      fakeDeveloperRegistrar,
    ] = await getAccounts();
    deployer = new DeployHelper(owner.wallet);

    // 14. Deploy project registrar and transfer ownership to developer
    projectRegistrar = await deployer.deployBaseProjectRegistrar(
      chipRegistry.address,
      ersRegistry.address,
      fakeDeveloperRegistrar.address
    );

    await projectRegistrar.connect(owner.wallet).transferOwnership(developerOne.address);
    await projectRegistrar.connect(developerOne.wallet).acceptOwnership();
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
      expect(actualDeveloperRegistrar).to.eq(fakeDeveloperRegistrar.address);
    });
  });

  describe("#setRootNode", async () => {
    let subjectRootNode: string;
    let subjectCaller:Account;

    beforeEach(async () => {
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
