import "module-alias/register";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ERSRegistry,
  DeveloperNameGovernor,
  DeveloperRegistry
} from "@utils/contracts";
import { ADDRESS_ZERO, NULL_NODE } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import { calculateLabelHash, createNameApprovalProof } from "../../utils/protocolUtils";
import { ethers } from "hardhat";

const expect = getWaffleExpect();

describe("DeveloperRegistry", () => {
  let owner: Account;
  let nameCoordinator: Account;
  let developerOne: Account;
  let attacker: Account;

  let ersRegistry: ERSRegistry;
  let developerNameGovernor: DeveloperNameGovernor;
  let developerRegistry: DeveloperRegistry;
  let chipRegistry: Account;
  let deployer: DeployHelper;

  beforeEach(async () => {
    [
      owner,
      nameCoordinator,
      developerOne,
      attacker,
      chipRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    developerRegistry = await deployer.deployDeveloperRegistry(owner.address);

    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

    developerNameGovernor = await deployer.deployDeveloperNameGovernor(developerRegistry.address, nameCoordinator.address);

    await developerRegistry.connect(owner.wallet).initialize(
      ersRegistry.address,
      [],
      developerNameGovernor.address
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should set the correct state variables", async () => {
      expect(await developerNameGovernor.owner()).to.eq(owner.address);
      expect(await developerNameGovernor.developerRegistry()).to.eq(developerRegistry.address);
      expect(await developerNameGovernor.nameCoordinator()).to.eq(nameCoordinator.address);
    });
  });

  describe("#claimName", async () => {
    let subjectDeveloperName: string;
    let subjectApprovalProof: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectDeveloperName = ethers.utils.formatBytes32String("testName");
      subjectCaller = developerOne;
      subjectApprovalProof = await createNameApprovalProof(nameCoordinator, subjectCaller.address, subjectDeveloperName);
    });

    async function subject(): Promise<any> {
      return await developerNameGovernor.connect(subjectCaller.wallet).claimName(
        subjectDeveloperName,
        subjectApprovalProof
      );
    }

    it("should set the developer name correctly in the pendingDevelopers mapping", async () => {
      await subject();

      const developerName = await developerRegistry.pendingDevelopers(subjectCaller.address);
      expect(developerName).to.eq(subjectDeveloperName);
    });

    describe("when an invalid name proof is provided", async () => {
      beforeEach(async () => {
        subjectCaller = attacker;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid signature");
      });
    });
  });

  describe("#removeNameClaim", async () => {
    let subjectDeveloperOwner: Address;
    let subjectCaller: Account;
    let developerName: string;

    beforeEach(async () => {
      subjectDeveloperOwner = developerOne.address;
      developerName = ethers.utils.formatBytes32String("testName");
      const subjectApprovalProof = await createNameApprovalProof(nameCoordinator, developerOne.address, developerName);

      await developerNameGovernor.connect(developerOne.wallet).claimName(
        developerName,
        subjectApprovalProof
      );

      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return await developerNameGovernor.connect(subjectCaller.wallet).removeNameClaim(
        subjectDeveloperOwner
      );
    }

    it("should remove the developer name from pendingDevelopers", async () => {
      const preDeveloperName = await developerRegistry.pendingDevelopers(subjectDeveloperOwner);
      expect(preDeveloperName).to.eq(developerName);

      await subject();

      const postDeveloperName = await developerRegistry.pendingDevelopers(subjectDeveloperOwner);
      expect(postDeveloperName).to.eq(NULL_NODE);
    });

    describe("when the caller is not the owner", async () => {
      beforeEach(async () => {
        subjectCaller = attacker;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#updateNameCoordinator", async () => {
    let subjectNewNameCoordinator: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectNewNameCoordinator = developerOne.address;
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return await developerNameGovernor.connect(subjectCaller.wallet).updateNameCoordinator(
        subjectNewNameCoordinator
      );
    }

    it("should set the new name coordinator address", async () => {
      await subject();

      const nameCoordinatorAddress = await developerNameGovernor.nameCoordinator();
      expect(nameCoordinatorAddress).to.eq(subjectNewNameCoordinator);
    });

    describe("when the passed address is the null address", async () => {
      beforeEach(async () => {
        subjectNewNameCoordinator = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Address cannot be zero address");
      });
    });

    describe("when the caller is not the owner", async () => {
      beforeEach(async () => {
        subjectCaller = attacker;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
