import "module-alias/register";

import { Account } from "@utils/test/types";
import { DeveloperRegistrar, DeveloperRegistrarFactory } from "@utils/contracts";
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
  let servicesRegistry: Account;
  let developerRegistrarImpl: DeveloperRegistrar;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let deployer: DeployHelper;

  beforeEach(async () => {
    [
      owner,
      developerRegistry,
      chipRegistry,
      ersRegistry,
      servicesRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    developerRegistrarImpl = await deployer.deployDeveloperRegistrar(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistry.address,
      servicesRegistry.address
    );

    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(
      developerRegistrarImpl.address,
      developerRegistry.address
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should set all the state correctly", async () => {
      const actualDeveloperRegistrar = await developerRegistrarFactory.developerRegistrar();
      const actualDeveloperRegistry = await developerRegistrarFactory.developerRegistry();

      expect(actualDeveloperRegistrar).to.eq(developerRegistrarImpl.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
    });
  });

  describe("#deployDeveloperRegistrar", async () => {
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectCaller = developerRegistry;
    });

    async function subject(): Promise<any> {
      return await developerRegistrarFactory.connect(subjectCaller.wallet).deployDeveloperRegistrar();
    }

    async function subjectCall(): Promise<any> {
      return await developerRegistrarFactory.connect(subjectCaller.wallet).callStatic.deployDeveloperRegistrar();
    }

    it("should set the state correctly on the newly deployed DeveloperRegistrar", async () => {
      const expectedRegistrarAddress = await subjectCall();

      await subject();

      const developerRegistrar = await deployer.getDeveloperRegistrar(expectedRegistrarAddress);

      const actualChipRegistry = await developerRegistrar.chipRegistry();
      const actualErsRegistry = await developerRegistrar.ers();
      const actualDeveloperRegistry = await developerRegistrar.developerRegistry();

      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
    });

    it("should emit the correct DeveloperRegistrarDeployed event", async () => {
      const expectedRegistrarAddress = await subjectCall();
      await expect(subject()).to.emit(developerRegistrarFactory, "DeveloperRegistrarDeployed").withArgs(
        expectedRegistrarAddress
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
