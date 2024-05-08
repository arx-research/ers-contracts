import "module-alias/register";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { ERSRegistry, DeveloperRegistrarFactory, DeveloperRegistry } from "@utils/contracts";
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

describe.only("DeveloperRegistry", () => {
  let owner: Account;
  let nameGovernor: Account;
  let developerOne: Account;
  let developerTwo: Account;
  let ersRegistry: ERSRegistry;
  let developerRegistry: DeveloperRegistry;
  let chipRegistry: Account;
  let servicesRegistry: Account;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let deployer: DeployHelper;

  beforeEach(async () => {
    [
      owner,
      nameGovernor,
      developerOne,
      developerTwo,
      chipRegistry,
      servicesRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    developerRegistry = await deployer.deployDeveloperRegistry(owner.address);

    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(chipRegistry.address, ersRegistry.address, developerRegistry.address, servicesRegistry.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should have the deployer set as the owner", async () => {
      const actualOwner = await developerRegistry.owner();
      expect(actualOwner).to.eq(owner.address);
    });
  });

  describe("#initialize", async () => {
    let subjectERSRegistry: Address;
    let subjectFactories: Address[];
    let subjectNameGovernor: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectERSRegistry = ersRegistry.address;
      subjectFactories = [developerRegistrarFactory.address];
      subjectNameGovernor = nameGovernor.address;
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return developerRegistry.connect(subjectCaller.wallet).initialize(
        subjectERSRegistry,
        subjectFactories,
        subjectNameGovernor
      );
    }

    it("should set factories, and set contract to initialized", async () => {
      await subject();

      const actualErsRegistry = await developerRegistry.ersRegistry();
      const isFactory = await developerRegistry.registrarFactories(subjectFactories[0]);
      const actualNameGovernor = await developerRegistry.nameGovernor();
      const isInitialized = await developerRegistry.initialized();

      expect(actualErsRegistry).to.eq(subjectERSRegistry);
      expect(actualNameGovernor).to.eq(subjectNameGovernor);
      expect(isFactory).to.be.true;
      expect(isInitialized).to.be.true;
    });

    it("should emit the correct RegistrarFactoryAdded event", async () => {
      await expect(subject()).to.emit(developerRegistry, "RegistrarFactoryAdded").withArgs(subjectFactories[0]);
    });

    it("should emit the correct RegistryInitialized event", async () => {
      await expect(subject()).to.emit(developerRegistry, "RegistryInitialized").withArgs(subjectERSRegistry);
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
        subjectCaller = developerOne;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  context("when the contract is initialized", async () => {
    beforeEach(async () => {
      await developerRegistry.initialize(ersRegistry.address, [], nameGovernor.address);
    });

    describe("#addAllowedDeveloper", async () => {
      let subjectDeveloperOwner: Address;
      let subjectNameHash: string;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectDeveloperOwner = developerOne.address;
        subjectNameHash = calculateLabelHash("gucci");
        subjectCaller = nameGovernor;
      });

      async function subject(): Promise<any> {
        return developerRegistry.connect(subjectCaller.wallet).addAllowedDeveloper(subjectDeveloperOwner, subjectNameHash);
      }

      it("should add the Developer to the allowed Developers", async () => {
        await subject();

        const nameHash = await developerRegistry.pendingDevelopers(subjectDeveloperOwner);
        expect(nameHash).to.eq(subjectNameHash);
      });

      it("should emit the correct event DeveloperAllowed", async () => {
        await expect(subject()).to.emit(developerRegistry, "DeveloperAllowed").withArgs(subjectDeveloperOwner, subjectNameHash);
      });

      describe("when the Developer is already allowed", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Developer already allowed");
        });
      });

      describe("when the passed owner is the zero address", async () => {
        beforeEach(async () => {
          subjectDeveloperOwner = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid Developer owner address");
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
          await developerRegistry.addRegistrarFactory(developerRegistrarFactory.address);
          await developerRegistry.connect(developerOne.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Name already taken");
        });
      });

      describe("when the caller is not the name governor", async () => {
        beforeEach(async () => {
          subjectCaller = owner;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Only the Name Governor can call this function");
        });
      });
    });

    describe("#addRegistrarFactory", async () => {
      let subjectFactory: Address;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectFactory = developerRegistrarFactory.address;
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return developerRegistry.connect(subjectCaller.wallet).addRegistrarFactory(subjectFactory);
      }

      it("should add the factory to the allowed factories", async () => {
        await subject();

        const isAllowed = await developerRegistry.registrarFactories(subjectFactory);
        expect(isAllowed).to.be.true;
      });

      it("should emit the correct event RegistrarFactoryAdded", async () => {
        await expect(subject()).to.emit(developerRegistry, "RegistrarFactoryAdded").withArgs(subjectFactory);
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
          subjectCaller = developerOne;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    });

    context("when factory has been added to DeveloperRegistry and Developer has been added post deployment", async () => {
      let developerNameHash: string;
      beforeEach(async () => {
        developerNameHash = calculateLabelHash("gucci");

        await developerRegistry.addRegistrarFactory(developerRegistrarFactory.address);
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerOne.address, developerNameHash);
      });

      describe("#createNewDeveloperRegistrar", async () => {
        let subjectFactory: Address;
        let subjectCaller: Account;

        beforeEach(async () => {
          subjectFactory = developerRegistrarFactory.address;
          subjectCaller = developerOne;
        });

        async function subject(): Promise<any> {
          return developerRegistry.connect(subjectCaller.wallet).createNewDeveloperRegistrar(subjectFactory);
        }

        async function subjectCall(): Promise<any> {
          return developerRegistry.connect(subjectCaller.wallet).callStatic.createNewDeveloperRegistrar(subjectFactory);
        }

        it("should create a new Developer registrar and add to mapping and array", async () => {
          const expectedRegistrar = await subjectCall();

          await subject();

          const isRegistrar = await developerRegistry.isDeveloperRegistrar(expectedRegistrar);
          const registrarArray = await developerRegistry.getDeveloperRegistrars();

          expect(isRegistrar).to.be.true;
          expect(registrarArray).to.contain(expectedRegistrar);
        });

        it("should set the correct owner and rootNode in the new DeveloperRegistrar", async () => {
          const expectedRegistrar = await subjectCall();
          const expectedNameHash = calculateSubnodeHash("gucci.ers");

          await subject();

          const deployedRegistrar = await deployer.getDeveloperRegistrar(expectedRegistrar);
          const actualOwner = await deployedRegistrar.owner();
          const actualRootNode = await deployedRegistrar.rootNode();

          expect(actualOwner).to.eq(developerOne.address);
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

        it("should clear the pendingDevelopers mapping", async () => {
          await subject();

          const nameHash = await developerRegistry.pendingDevelopers(subjectCaller.address);
          expect(nameHash).to.eq(NULL_NODE);
        });

        it("should emit the correct event DeveloperRegistrarAdded", async () => {
          const expectedRegistrar = await subjectCall();
          const expectedNameHash = calculateSubnodeHash("gucci.ers");

          await expect(subject()).to.emit(developerRegistry, "DeveloperRegistrarAdded").withArgs(
            expectedRegistrar,
            developerOne.address,
            expectedNameHash
          );
        });

        describe("when the caller is not allowed to create a Developer registrar", async () => {
          beforeEach(async () => {
            subjectCaller = developerTwo;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Caller must be approved Developer address");
          });
        });

        describe("when the factory is not allowed", async () => {
          beforeEach(async () => {
            subjectFactory = developerTwo.address;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Factory must be approved DeveloperRegistrarFactory");
          });
        });
      });

      describe("#revokeDeveloperRegistrar", async () => {
        let subjectDeveloperRegistrar: Address;
        let subjectNameHash: string;
        let subjectCaller: Account;

        beforeEach(async () => {
          await developerRegistry.connect(developerOne.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
          const registrars = await developerRegistry.getDeveloperRegistrars();

          subjectDeveloperRegistrar = registrars[registrars.length - 1];
          subjectNameHash = developerNameHash;
          subjectCaller = owner;
        });

        async function subject(): Promise<any> {
          return developerRegistry.connect(subjectCaller.wallet).revokeDeveloperRegistrar(subjectDeveloperRegistrar, subjectNameHash);
        }

        it("should remove the Developer from isDeveloperRegistrar and developerRegistrars array", async () => {
          await subject();

          const isDeveloperRegistrar = await developerRegistry.isDeveloperRegistrar(subjectDeveloperRegistrar);
          const developerRegistrars = await developerRegistry.getDeveloperRegistrars();

          expect(isDeveloperRegistrar).to.be.false;
          expect(developerRegistrars).to.not.include(subjectDeveloperRegistrar);
        });

        it("should set the correct owner and resolver addresses in the ERSRegistry", async () => {
          const expectedSubnodeHash = calculateSubnodeHash("gucci.ers");
          const preOwner = await ersRegistry.getOwner(expectedSubnodeHash);
          const preResolver = await ersRegistry.getResolver(expectedSubnodeHash);

          expect(preOwner).to.eq(subjectDeveloperRegistrar);
          expect(preResolver).to.eq(subjectDeveloperRegistrar);

          await subject();

          const postOwner = await ersRegistry.getOwner(expectedSubnodeHash);
          const postResolver = await ersRegistry.getResolver(expectedSubnodeHash);

          expect(postOwner).to.eq(ADDRESS_ZERO);
          expect(postResolver).to.eq(ADDRESS_ZERO);
        });

        it("should emit the correct DeveloperRegistrarRevoked event", async () => {
          const expectedSubnodeHash = calculateSubnodeHash("gucci.ers");

          await expect(subject()).to.emit(developerRegistry, "DeveloperRegistrarRevoked").withArgs(
            subjectDeveloperRegistrar,
            expectedSubnodeHash,
            subjectNameHash
          );
        });

        describe("when passed nameHash isn't the nameHash of the revoked DeveloperRegistrar", async () => {
          beforeEach(async () => {
            subjectNameHash = calculateLabelHash("NotGucci");
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Passed subnode does not match Registrar's root node");
          });
        });

        describe("when passed address is not a DeveloperRegistrar", async () => {
          beforeEach(async () => {
            subjectDeveloperRegistrar = owner.address;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Not a DeveloperRegistrar");
          });
        });

        describe("when the caller is not the owner", async () => {
          beforeEach(async () => {
            subjectCaller = developerOne;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
          });
        });
      });

      describe("#removeAllowedDeveloper", async () => {
        let subjectDeveloperOwner: Address;
        let subjectCaller: Account;

        beforeEach(async () => {
          subjectDeveloperOwner = developerOne.address;
          subjectCaller = nameGovernor;
        });

        async function subject(): Promise<any> {
          return developerRegistry.connect(subjectCaller.wallet).removeAllowedDeveloper(subjectDeveloperOwner);
        }

        it("should remove the Developer from the allowed Developers", async () => {
          await subject();

          const nameHash = await developerRegistry.pendingDevelopers(subjectDeveloperOwner);
          expect(nameHash).to.eq(NULL_NODE);
        });

        it("should emit the correct event DeveloperDisallowed", async () => {
          await expect(subject()).to.emit(developerRegistry, "DeveloperDisallowed").withArgs(subjectDeveloperOwner);
        });

        describe("when the Developer is not allowed", async () => {
          beforeEach(async () => {
            await subject();
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Developer not allowed");
          });
        });

        describe("when the caller is not the owner", async () => {
          beforeEach(async () => {
            subjectCaller = owner;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Only the Name Governor can call this function");
          });
        });
      });

      describe("#removeRegistrarFactory", async () => {
        let subjectFactory: Address;
        let subjectCaller: Account;

        beforeEach(async () => {
          subjectFactory = developerRegistrarFactory.address;
          subjectCaller = owner;
        });

        async function subject(): Promise<any> {
          return developerRegistry.connect(subjectCaller.wallet).removeRegistrarFactory(subjectFactory);
        }

        it("should add the factory to the allowed factories", async () => {
          await subject();

          const isAllowed = await developerRegistry.registrarFactories(subjectFactory);
          expect(isAllowed).to.be.false;
        });

        it("should emit the correct event RegistrarFactoryRemoved", async () => {
          await expect(subject()).to.emit(developerRegistry, "RegistrarFactoryRemoved").withArgs(subjectFactory);
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
            subjectCaller = developerOne;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
          });
        });
      });
    });
  });
});
