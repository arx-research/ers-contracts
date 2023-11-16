import "module-alias/register";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { TSMRegistrarFactory } from "@utils/contracts";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

const expect = getWaffleExpect();

describe("TSMRegistrarFactory", () => {
  let owner: Account;
  let tsmRegistry: Account;
  let chipRegistry: Account;
  let ersRegistry: Account;
  let tsmRegistrarFactory: TSMRegistrarFactory;
  let deployer: DeployHelper;

  beforeEach(async () => {
    [
      owner,
      tsmRegistry,
      chipRegistry,
      ersRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    tsmRegistrarFactory = await deployer.deployTSMRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      tsmRegistry.address
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should set all the state correctly", async () => {
      const actualChipRegistry = await tsmRegistrarFactory.chipRegistry();
      const actualErsRegistry = await tsmRegistrarFactory.ers();
      const actualTsmRegistry = await tsmRegistrarFactory.tsmRegistry();

      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualTsmRegistry).to.eq(tsmRegistry.address);
    });
  });

  describe("#deployRegistrar", async () => {
    let subjectOwner: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectOwner = owner.address;
      subjectCaller = tsmRegistry;
    });

    async function subject(): Promise<any> {
      return await tsmRegistrarFactory.connect(subjectCaller.wallet).deployRegistrar(subjectOwner);
    }

    async function subjectCall(): Promise<any> {
      return await tsmRegistrarFactory.connect(subjectCaller.wallet).callStatic.deployRegistrar(subjectOwner);
    }

    it("should set the state correctly on the newly deployed TSMRegistrar", async () => {
      const expectedRegistrarAddress = await subjectCall();

      await subject();

      const tsmRegistrar = await deployer.getTSMRegistrar(expectedRegistrarAddress);

      const actualChipRegistry = await tsmRegistrar.chipRegistry();
      const actualErsRegistry = await tsmRegistrar.ers();
      const actualTsmRegistry = await tsmRegistrar.tsmRegistry();
      const actualOwner = await tsmRegistrar.owner();

      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualTsmRegistry).to.eq(tsmRegistry.address);
      expect(actualOwner).to.eq(subjectOwner);
    });

    it("should emit the correct TSMRegistrarDeployed event", async () => {
      const expectedRegistrarAddress = await subjectCall();
      await expect(subject()).to.emit(tsmRegistrarFactory, "TSMRegistrarDeployed").withArgs(
        expectedRegistrarAddress,
        subjectOwner
      );
    });

    describe("when the caller is not the tsm registry", async () => {
      beforeEach(async () => {
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be TSMRegistry");
      });
    });
  });
});
