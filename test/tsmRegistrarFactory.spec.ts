import "module-alias/register";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { DeveloperRegistrarFactory } from "@utils/contracts";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

const expect = getWaffleExpect();

describe("DeveloperRegistrarFactory", () => {
  let owner: Account;
  let developerRegistry: Account;
  let chipRegistry: Account;
  let ersRegistry: Account;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let deployer: DeployHelper;

  beforeEach(async () => {
    [
      owner,
      developerRegistry,
      chipRegistry,
      ersRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistry.address
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should set all the state correctly", async () => {
      const actualChipRegistry = await developerRegistrarFactory.chipRegistry();
      const actualErsRegistry = await developerRegistrarFactory.ers();
      const actualDeveloperRegistry = await developerRegistrarFactory.developerRegistry();

      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
    });
  });

  describe("#deployRegistrar", async () => {
    let subjectOwner: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectOwner = owner.address;
      subjectCaller = developerRegistry;
    });

    async function subject(): Promise<any> {
      return await developerRegistrarFactory.connect(subjectCaller.wallet).deployRegistrar(subjectOwner);
    }

    async function subjectCall(): Promise<any> {
      return await developerRegistrarFactory.connect(subjectCaller.wallet).callStatic.deployRegistrar(subjectOwner);
    }

    it("should set the state correctly on the newly deployed DeveloperRegistrar", async () => {
      const expectedRegistrarAddress = await subjectCall();

      await subject();

      const developerRegistrar = await deployer.getDeveloperRegistrar(expectedRegistrarAddress);

      const actualChipRegistry = await developerRegistrar.chipRegistry();
      const actualErsRegistry = await developerRegistrar.ers();
      const actualDeveloperRegistry = await developerRegistrar.developerRegistry();
      const actualOwner = await developerRegistrar.owner();

      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
      expect(actualOwner).to.eq(subjectOwner);
    });

    it("should emit the correct DeveloperRegistrarDeployed event", async () => {
      const expectedRegistrarAddress = await subjectCall();
      await expect(subject()).to.emit(developerRegistrarFactory, "DeveloperRegistrarDeployed").withArgs(
        expectedRegistrarAddress,
        subjectOwner
      );
    });

    describe("when the caller is not the developer registry", async () => {
      beforeEach(async () => {
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be DeveloperRegistry");
      });
    });
  });
});
