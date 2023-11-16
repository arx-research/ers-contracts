import "module-alias/register";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { ERSRegistry, TSMRegistrarFactory, TSMRegistry } from "@utils/contracts";
import { ADDRESS_ZERO, NULL_NODE } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import { calculateLabelHash, calculateSubnodeHash } from "../utils/protocolUtils";
import { ethers } from "hardhat";

const expect = getWaffleExpect();

describe("TSMRegistry", () => {
  let owner: Account;
  let tsmOne: Account;
  let tsmTwo: Account;
  let ersRegistry: ERSRegistry;
  let tsmRegistry: TSMRegistry;
  let chipRegistry: Account;
  let tsmRegistrarFactory: TSMRegistrarFactory;
  let deployer: DeployHelper;

  beforeEach(async () => {
    [
      owner,
      tsmOne,
      tsmTwo,
      chipRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    tsmRegistry = await deployer.deployTSMRegistry(owner.address);

    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, tsmRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), tsmRegistry.address, tsmRegistry.address);

    tsmRegistrarFactory = await deployer.deployTSMRegistrarFactory(chipRegistry.address, ersRegistry.address, tsmRegistry.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should have the deployer set as the owner", async () => {
      const actualOwner = await tsmRegistry.owner();
      expect(actualOwner).to.eq(owner.address);
    });
  });

  describe("#initialize", async () => {
    let subjectERSRegistry: Address;
    let subjectFactories: Address[];
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectERSRegistry = ersRegistry.address;
      subjectFactories = [tsmRegistrarFactory.address];
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return tsmRegistry.connect(subjectCaller.wallet).initialize(subjectERSRegistry, subjectFactories);
    }

    it("should set factories, and set contract to initialized", async () => {
      await subject();

      const actualErsRegistry = await tsmRegistry.ersRegistry();
      const isFactory = await tsmRegistry.registrarFactories(subjectFactories[0]);
      const isInitialized = await tsmRegistry.initialized();

      expect(actualErsRegistry).to.eq(subjectERSRegistry);
      expect(isFactory).to.be.true;
      expect(isInitialized).to.be.true;
    });

    it("should emit the correct RegistrarFactoryAdded event", async () => {
      await expect(subject()).to.emit(tsmRegistry, "RegistrarFactoryAdded").withArgs(subjectFactories[0]);
    });

    it("should emit the correct RegistryInitialized event", async () => {
      await expect(subject()).to.emit(tsmRegistry, "RegistryInitialized").withArgs(subjectERSRegistry);
    });

    describe("when the contract is already initialized", async () => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Contract already initialized");
      });
    });

    describe("when the caller is not the owner", async () => {
      beforeEach(async () => {
        subjectCaller = tsmOne;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  context("when the contract is initialized", async () => {
    beforeEach(async () => {
      await tsmRegistry.initialize(ersRegistry.address, []);
    });

    describe("#addAllowedTSM", async () => {
      let subjectTSMOwner: Address;
      let subjectNameHash: string;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectTSMOwner = tsmOne.address;
        subjectNameHash = calculateLabelHash("gucci");
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return tsmRegistry.connect(subjectCaller.wallet).addAllowedTSM(subjectTSMOwner, subjectNameHash);
      }

      it("should add the TSM to the allowed TSMs", async () => {
        await subject();

        const nameHash = await tsmRegistry.pendingTSMs(subjectTSMOwner);
        expect(nameHash).to.eq(subjectNameHash);
      });

      it("should emit the correct event TSMAllowed", async () => {
        await expect(subject()).to.emit(tsmRegistry, "TSMAllowed").withArgs(subjectTSMOwner, subjectNameHash);
      });

      describe("when the TSM is already allowed", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("TSM already allowed");
        });
      });

      describe("when the passed owner is the zero address", async () => {
        beforeEach(async () => {
          subjectTSMOwner = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid TSM owner address");
        });
      });

      describe("when the passed _nameHash is empty bytes", async () => {
        beforeEach(async () => {
          subjectNameHash = ethers.utils.formatBytes32String("");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid name hash");
        });
      });

      describe("when the passed _nameHash is already in use", async () => {
        beforeEach(async () => {
          await subject();
          await tsmRegistry.addRegistrarFactory(tsmRegistrarFactory.address);
          await tsmRegistry.connect(tsmOne.wallet).createNewTSMRegistrar(tsmRegistrarFactory.address);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Name already taken");
        });
      });

      describe("when the caller is not the owner", async () => {
        beforeEach(async () => {
          subjectCaller = tsmOne;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    });

    describe("#addRegistrarFactory", async () => {
      let subjectFactory: Address;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectFactory = tsmRegistrarFactory.address;
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return tsmRegistry.connect(subjectCaller.wallet).addRegistrarFactory(subjectFactory);
      }

      it("should add the factory to the allowed factories", async () => {
        await subject();

        const isAllowed = await tsmRegistry.registrarFactories(subjectFactory);
        expect(isAllowed).to.be.true;
      });

      it("should emit the correct event RegistrarFactoryAdded", async () => {
        await expect(subject()).to.emit(tsmRegistry, "RegistrarFactoryAdded").withArgs(subjectFactory);
      });

      describe("when the factory is already added", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Factory already added");
        });
      });

      describe("when the passed factory is the zero address", async () => {
        beforeEach(async () => {
          subjectFactory = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid factory address");
        });
      });

      describe("when the caller is not the owner", async () => {
        beforeEach(async () => {
          subjectCaller = tsmOne;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    });

    context("when factory has been added to TSMRegistry and TSM has been added post deployment", async () => {
      let tsmNameHash: string;
      beforeEach(async () => {
        tsmNameHash = calculateLabelHash("gucci");

        await tsmRegistry.addRegistrarFactory(tsmRegistrarFactory.address);
        await tsmRegistry.addAllowedTSM(tsmOne.address, tsmNameHash);
      });

      describe("#createNewTSMRegistrar", async () => {
        let subjectFactory: Address;
        let subjectCaller: Account;

        beforeEach(async () => {
          subjectFactory = tsmRegistrarFactory.address;
          subjectCaller = tsmOne;
        });

        async function subject(): Promise<any> {
          return tsmRegistry.connect(subjectCaller.wallet).createNewTSMRegistrar(subjectFactory);
        }

        async function subjectCall(): Promise<any> {
          return tsmRegistry.connect(subjectCaller.wallet).callStatic.createNewTSMRegistrar(subjectFactory);
        }

        it("should create a new TSM registrar and add to mapping and array", async () => {
          const expectedRegistrar = await subjectCall();

          await subject();

          const isRegistrar = await tsmRegistry.isTSMRegistrar(expectedRegistrar);
          const registrarArray = await tsmRegistry.getTSMRegistrars();

          expect(isRegistrar).to.be.true;
          expect(registrarArray).to.contain(expectedRegistrar);
        });

        it("should set the correct owner and rootNode in the new TSMRegistrar", async () => {
          const expectedRegistrar = await subjectCall();
          const expectedNameHash = calculateSubnodeHash("gucci.ers");

          await subject();

          const deployedRegistrar = await deployer.getTSMRegistrar(expectedRegistrar);
          const actualOwner = await deployedRegistrar.owner();
          const actualRootNode = await deployedRegistrar.rootNode();

          expect(actualOwner).to.eq(tsmOne.address);
          expect(actualRootNode).to.eq(expectedNameHash);
        });

        it("should set the correct owner and resolver addresses in the ERSRegistry", async () => {
          const expectedRegistrar = await subjectCall();
          const expectedNameHash = calculateSubnodeHash("gucci.ers");

          await subject();

          const actualOwner = await ersRegistry.getOwner(expectedNameHash);
          const actualResolver = await ersRegistry.getResolver(expectedNameHash);

          expect(actualOwner).to.eq(expectedRegistrar);
          expect(actualResolver).to.eq(expectedRegistrar);
        });

        it("should clear the pendingTSMs mapping", async () => {
          await subject();

          const nameHash = await tsmRegistry.pendingTSMs(subjectCaller.address);
          expect(nameHash).to.eq(NULL_NODE);
        });

        it("should emit the correct event TSMRegistrarAdded", async () => {
          const expectedRegistrar = await subjectCall();
          const expectedNameHash = calculateSubnodeHash("gucci.ers");

          await expect(subject()).to.emit(tsmRegistry, "TSMRegistrarAdded").withArgs(
            expectedRegistrar,
            tsmOne.address,
            expectedNameHash
          );
        });

        describe("when the caller is not allowed to create a TSM registrar", async () => {
          beforeEach(async () => {
            subjectCaller = tsmTwo;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Caller must be approved TSM address");
          });
        });

        describe("when the factory is not allowed", async () => {
          beforeEach(async () => {
            subjectFactory = tsmTwo.address;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Factory must be approved TSMRegistrarFactory");
          });
        });
      });

      describe("#revokeTSMRegistrar", async () => {
        let subjectTSMRegistrar: Address;
        let subjectNameHash: string;
        let subjectCaller: Account;

        beforeEach(async () => {
          await tsmRegistry.connect(tsmOne.wallet).createNewTSMRegistrar(tsmRegistrarFactory.address);
          const registrars = await tsmRegistry.getTSMRegistrars();

          subjectTSMRegistrar = registrars[registrars.length - 1];
          subjectNameHash = tsmNameHash;
          subjectCaller = owner;
        });

        async function subject(): Promise<any> {
          return tsmRegistry.connect(subjectCaller.wallet).revokeTSMRegistrar(subjectTSMRegistrar, subjectNameHash);
        }

        it("should remove the TSM from isTSMRegistrar and tsmRegistrars array", async () => {
          await subject();

          const isTSMRegistrar = await tsmRegistry.isTSMRegistrar(subjectTSMRegistrar);
          const tsmRegistrars = await tsmRegistry.getTSMRegistrars();

          expect(isTSMRegistrar).to.be.false;
          expect(tsmRegistrars).to.not.include(subjectTSMRegistrar);
        });

        it("should set the correct owner and resolver addresses in the ERSRegistry", async () => {
          const expectedSubnodeHash = calculateSubnodeHash("gucci.ers");
          const preOwner = await ersRegistry.getOwner(expectedSubnodeHash);
          const preResolver = await ersRegistry.getResolver(expectedSubnodeHash);

          expect(preOwner).to.eq(subjectTSMRegistrar);
          expect(preResolver).to.eq(subjectTSMRegistrar);

          await subject();

          const postOwner = await ersRegistry.getOwner(expectedSubnodeHash);
          const postResolver = await ersRegistry.getResolver(expectedSubnodeHash);

          expect(postOwner).to.eq(ADDRESS_ZERO);
          expect(postResolver).to.eq(ADDRESS_ZERO);
        });

        it("should emit the correct TSMRegistrarRevoked event", async () => {
          const expectedSubnodeHash = calculateSubnodeHash("gucci.ers");

          await expect(subject()).to.emit(tsmRegistry, "TSMRegistrarRevoked").withArgs(
            subjectTSMRegistrar,
            expectedSubnodeHash,
            subjectNameHash
          );
        });

        describe("when passed nameHash isn't the nameHash of the revoked TSMRegistrar", async () => {
          beforeEach(async () => {
            subjectNameHash = calculateLabelHash("NotGucci");
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Passed subnode does not match Registrar's root node");
          });
        });

        describe("when passed address is not a TSMRegistrar", async () => {
          beforeEach(async () => {
            subjectTSMRegistrar = owner.address;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Not a TSMRegistrar");
          });
        });

        describe("when the caller is not the owner", async () => {
          beforeEach(async () => {
            subjectCaller = tsmOne;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
          });
        });
      });

      describe("#removeAllowedTSM", async () => {
        let subjectTSMOwner: Address;
        let subjectCaller: Account;

        beforeEach(async () => {
          subjectTSMOwner = tsmOne.address;
          subjectCaller = owner;
        });

        async function subject(): Promise<any> {
          return tsmRegistry.connect(subjectCaller.wallet).removeAllowedTSM(subjectTSMOwner);
        }

        it("should remove the TSM from the allowed TSMs", async () => {
          await subject();

          const nameHash = await tsmRegistry.pendingTSMs(subjectTSMOwner);
          expect(nameHash).to.eq(NULL_NODE);
        });

        it("should emit the correct event TSMDisallowed", async () => {
          await expect(subject()).to.emit(tsmRegistry, "TSMDisallowed").withArgs(subjectTSMOwner);
        });

        describe("when the TSM is not allowed", async () => {
          beforeEach(async () => {
            await subject();
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("TSM not allowed");
          });
        });

        describe("when the caller is not the owner", async () => {
          beforeEach(async () => {
            subjectCaller = tsmOne;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
          });
        });
      });

      describe("#removeRegistrarFactory", async () => {
        let subjectFactory: Address;
        let subjectCaller: Account;

        beforeEach(async () => {
          subjectFactory = tsmRegistrarFactory.address;
          subjectCaller = owner;
        });

        async function subject(): Promise<any> {
          return tsmRegistry.connect(subjectCaller.wallet).removeRegistrarFactory(subjectFactory);
        }

        it("should add the factory to the allowed factories", async () => {
          await subject();

          const isAllowed = await tsmRegistry.registrarFactories(subjectFactory);
          expect(isAllowed).to.be.false;
        });

        it("should emit the correct event RegistrarFactoryRemoved", async () => {
          await expect(subject()).to.emit(tsmRegistry, "RegistrarFactoryRemoved").withArgs(subjectFactory);
        });

        describe("when the factory is not added", async () => {
          beforeEach(async () => {
            await subject();
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Factory not added");
          });
        });

        describe("when the caller is not the owner", async () => {
          beforeEach(async () => {
            subjectCaller = tsmOne;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
          });
        });
      });
    });
  });
});
