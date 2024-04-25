import "module-alias/register";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  Address,
  ManufacturerValidationInfo,
  ServiceRecord,
  ProjectChipAddition
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ChipRegistry,
  ERSRegistry,
  ManufacturerRegistry,
  ProjectRegistrarMock,
  ServicesRegistry,
  TransferPolicyMock,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistryMock,
  DeveloperRegistry,
  PBTSimpleProjectRegistrar
} from "@utils/contracts";
import { ADDRESS_ZERO, NULL_NODE, ONE, ONE_DAY_IN_SECONDS, ZERO } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import {
  calculateEnrollmentId,
  calculateLabelHash,
  calculateSubnodeHash,
  createManufacturerCertificate,
  createProjectOwnershipProof
} from "@utils/protocolUtils";
import { Blockchain } from "@utils/common";
import { namehash } from "ethers/lib/utils";

const expect = getWaffleExpect();

describe("ChipRegistry", () => {
  let owner: Account;
  let developerOne: Account;
  let developerTwo: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let chipThree: Account;
  let newOwner: Account;
  let nameGovernor: Account;

  let manufacturerRegistry: ManufacturerRegistry;
  let ersRegistry: ERSRegistry;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let developerRegistry: DeveloperRegistry;
  let servicesRegistry: ServicesRegistry;
  let chipRegistry: ChipRegistry;
  let developerRegistrar: DeveloperRegistrar;
  let transferPolicy: TransferPolicyMock;
  let fakeProjectRegistrar: Account;
  let projectRegistrarOne: ProjectRegistrarMock;
  let projectRegistrarTwo: PBTSimpleProjectRegistrar;

  let manufacturerId: string;
  let serviceId: string;
  let serviceRecords: ServiceRecord[];
  let chipsEnrollmentId: string;

  let deployer: DeployHelper;
  let blockchain: Blockchain;
  let chainId: number;

  before(async () => {
    [
      owner,
      developerOne,
      developerTwo,
      manufacturerOne,
      chipOne,
      chipTwo,
      chipThree,
      newOwner,
      fakeProjectRegistrar,
      nameGovernor,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);
    blockchain = new Blockchain(ethers.provider);
    chainId = await blockchain.getChainId();

    manufacturerRegistry = await deployer.deployManufacturerRegistry(owner.address);

    chipRegistry = await deployer.deployChipRegistry(
      manufacturerRegistry.address,
      BigNumber.from(1000)
    );

    developerRegistry = await deployer.deployDeveloperRegistry(owner.address);
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    servicesRegistry = await deployer.deployServicesRegistry(chipRegistry.address);

    await developerRegistry.initialize(ersRegistry.address, [], nameGovernor.address);

    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

    manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
    await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistry.address
    );
    await developerRegistry.addRegistrarFactory(developerRegistrarFactory.address);
    
    transferPolicy = await deployer.mocks.deployTransferPolicyMock();

    await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
      manufacturerId,
      manufacturerOne.address,
      manufacturerOne.address,      // Placeholder
      "ipfs://QmQmQmQmQmQmQmQmQmQmQmQmQmQmQm",
      "https://bootloader.app",
      "SuperCool ChipModel"
    );

    // Create Service project uses
    serviceId = ethers.utils.formatBytes32String("Gucci-Flex");
    serviceRecords = [
      {
        recordType: ethers.utils.formatBytes32String("tokenUri"),
        content: ethers.utils.hexlify(Buffer.from("api.gucci.com/tokens/1/")),
        appendId: true,
      },
      {
        recordType: ethers.utils.formatBytes32String("redirectUrl"),
        content: ethers.utils.hexlify(Buffer.from("flex.gucci.com")),
        appendId: false,
      },
    ];

    await servicesRegistry.connect(owner.wallet).createService(serviceId, serviceRecords);

    chipsEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);

    await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerOne.address, calculateLabelHash("gucci"));
    await developerRegistry.connect(developerOne.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should set the correct initial state", async () => {
      const actualManufacturerRegistry = await chipRegistry.manufacturerRegistry();
      const actualMaxLockinPeriod = await chipRegistry.maxLockinPeriod();

      expect(actualManufacturerRegistry).to.eq(manufacturerRegistry.address);
      expect(actualMaxLockinPeriod).to.eq(BigNumber.from(1000));
    });
  });

  describe("#initialize", async () => {
    let subjectERSRegistry: Address;
    let subjectServicesRegistry: Address;
    let subjectDeveloperRegistry: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectERSRegistry = ersRegistry.address;
      subjectServicesRegistry = servicesRegistry.address;
      subjectDeveloperRegistry = developerRegistry.address;
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return chipRegistry.connect(subjectCaller.wallet).initialize(
        subjectERSRegistry,
        subjectServicesRegistry,
        subjectDeveloperRegistry
      );
    }

    it("should set the correct initial state", async () => {
      await subject();

      const actualErsRegistry = await chipRegistry.ers();
      const actualServicesRegistry = await chipRegistry.servicesRegistry();
      const actualDeveloperRegistry = await chipRegistry.developerRegistry();
      const isInitialized = await chipRegistry.initialized();

      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualServicesRegistry).to.eq(servicesRegistry.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
      expect(isInitialized).to.be.true;
    });

    it("should emit a RegistryInitialized event", async () => {
      await expect(subject()).to.emit(chipRegistry, "RegistryInitialized").withArgs(
        subjectERSRegistry,
        subjectServicesRegistry,
        subjectDeveloperRegistry
      );
    });

    describe("when the contract is initialized already", async () => {
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

  context("when a Developer has deployed their Registrar", async () => {
    beforeEach(async () => {
      await chipRegistry.initialize(ersRegistry.address, servicesRegistry.address, developerRegistry.address);
    });

    describe("#addProjectEnrollment", async () => {
      let subjectProjectRegistrar: Address;
      let subjectTransferPolicy: Address;
      let subjectNameHash: string;
      let subjectCaller: Account;
      let subjectServiceId: string;
      let subjectLockinPeriod: BigNumber;

      beforeEach(async () => {
        developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        projectRegistrarOne = await deployer.mocks.deployProjectRegistrarMock(
          chipRegistry.address,
          ersRegistry.address
        );

        subjectNameHash = calculateLabelHash("ProjectX");
        subjectProjectRegistrar = projectRegistrarOne.address;
        subjectTransferPolicy = ADDRESS_ZERO;
        subjectServiceId = serviceId;
        subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
        subjectCaller = developerOne;
      });
  
      async function subject(): Promise<any> {
        return developerRegistrar.connect(subjectCaller.wallet).addProject(
          subjectProjectRegistrar,
          subjectNameHash,
          subjectServiceId,
          subjectLockinPeriod,
        );
      }

      it("should add the project enrollment", async () => {
        await subject();

        const actualProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);

        expect(actualProjectInfo.creationTimestamp).to.eq(await blockchain.getCurrentTimestamp());
        expect(actualProjectInfo.chipsAdded).to.be.false;
      });

      it("should emit the correct ProjectEnrollmentAdded event", async () => {
        await expect(subject()).to.emit(chipRegistry, "ProjectEnrollmentAdded").withArgs(
          developerRegistrar.address,
          subjectProjectRegistrar
        );
      });

      describe("when the caller is not a Developer Registrar", async () => {
        beforeEach(async () => {
          subjectCaller = developerTwo;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
        });

        // TODO: review switching back to a mock here to validate original revert conditions.
        // it("should revert", async () => {
        //   await expect(subject()).to.be.revertedWith("Must be Developer Registrar");
        // });
      });

      describe("when the project registrar has already been enrolled as a project", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Project already enrolled");
        });
      });

      describe("when the registrar is the zero address", async () => {
        beforeEach(async () => {
          subjectProjectRegistrar = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid project registrar address"); // caught in developer registrar
        });
      });
    });

    context("setting up project enrollment", async () => {
      let projectWallet: Account;
      let projectNodeHash: string;

      describe("#addChip", async () => {
        let subjectChipIdOne: Address;
        let subjectChipIdTwo: Address;
        let subjectChipOwner: Address;
        let subjectManufacturerValidationOne: ManufacturerValidationInfo;
        let subjectManufacturerValidationTwo: ManufacturerValidationInfo;
        let subjectCaller: Account;

        let subjectProjectRegistrar: Address;
        let subjectTransferPolicy: Address;
        let subjectNameHash: string;
        let subjectServiceId: string;
        let subjectLockinPeriod: BigNumber;
        let subjectChipAdditionOne: ProjectChipAddition[];
        let subjectChipAdditionTwo: ProjectChipAddition[];

        beforeEach(async () => {
          developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

          subjectTransferPolicy = ADDRESS_ZERO;
          subjectCaller = developerOne;

          projectRegistrarTwo = await deployer.deployPBTSimpleProjectRegistrar(
            chipRegistry.address,
            ersRegistry.address,
            developerRegistrar.address,
            "ProjectY",
            "PRY",
            "https://projecty.com/",
            BigNumber.from(5),
            subjectTransferPolicy
          );
          projectRegistrarTwo.connect(owner.wallet).transferOwnership(developerOne.address);

          subjectNameHash = calculateLabelHash("ProjectY");
          subjectProjectRegistrar = projectRegistrarTwo.address;

          subjectServiceId = serviceId;
          subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);

          await developerRegistrar.connect(subjectCaller.wallet).addProject(
            subjectProjectRegistrar,
            subjectNameHash,
            subjectServiceId, 
            subjectLockinPeriod,
          );

          subjectChipIdOne = chipOne.address;
          subjectManufacturerValidationOne = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chipOne.address),
          };
        });

        async function subject(): Promise<any> {
          subjectChipAdditionOne = [
            {
              chipId: subjectChipIdOne,
              chipOwner: developerOne.address,
              nameHash: calculateLabelHash(subjectChipIdOne),
              manufacturerValidation: subjectManufacturerValidationOne,
            } as ProjectChipAddition,
          ]

          // One the mock, anyone can add a chip to a project.
          return projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAdditionOne);
        }

        it("should add the chip and set chip state", async () => {
          await subject();

          const actualChipInfo = (await chipRegistry.chipEnrollments(subjectChipIdOne)).chipAdded;
          expect(actualChipInfo).to.eq(true);
        });

        it("should set the chip owner and update owner balances", async () => {
          await subject();

          const actualChipOwner = (await chipRegistry.ownerOf(subjectChipIdOne));
          expect(actualChipOwner).to.eq(developerOne.address);
        });

        it("should map chip id to the namehash", async () => {
          await subject();

          const actualNamehash = (await chipRegistry.chipEnrollments(subjectChipIdOne)).nameHash;
          expect(actualNamehash).to.eq(calculateLabelHash(subjectChipIdOne));
        });

        it("should set the project's chipsAdded field to true", async () => {
          const preProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);
          expect(preProjectInfo.chipsAdded).to.be.false;

          await subject();

          const postProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);
          expect(postProjectInfo.chipsAdded).to.be.true;
        });

        it("should update state on the ServicesRegistry", async () => {
          await subject();

          const chipServices = await servicesRegistry.chipServices(subjectChipIdOne);

          expect(chipServices.primaryService).to.eq(ethers.utils.formatBytes32String("Gucci-Flex"));
          expect(chipServices.serviceTimelock).to.eq(subjectLockinPeriod);
        });

        it("should emit a ChipAdded event", async () => {
          await expect(subject()).to.emit(chipRegistry, "ChipAdded").withArgs(
            subjectChipIdOne,
            developerOne.address,
            ethers.utils.formatBytes32String("Gucci-Flex"),
            calculateSubnodeHash(`${subjectChipIdOne}.ProjectY.gucci.ers`),
            subjectManufacturerValidationOne.enrollmentId
          );
        });

        describe("when the timelock period exceeds the max set by governance", async () => {
          let newMaxTimelock: BigNumber;

          beforeEach(async () => {
            newMaxTimelock = BigNumber.from(50);
            await chipRegistry.updateMaxLockinPeriod(newMaxTimelock);
          });

          it("should set the primary service timelock to project creation timestamp + max", async () => {
            const creationTimestamp = (await chipRegistry.projectEnrollments(subjectProjectRegistrar)).creationTimestamp;

            await subject();

            const chipServices = await servicesRegistry.chipServices(subjectChipIdOne);

            expect(chipServices.serviceTimelock).to.eq(creationTimestamp.add(newMaxTimelock));
          });
        });

        describe("when a second chip is being added to a project", async () => {
          beforeEach(async () => {
            subjectChipIdTwo = chipTwo.address;
            subjectChipOwner = developerOne.address;

            subjectManufacturerValidationTwo = {
              enrollmentId: chipsEnrollmentId,
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, subjectChipIdTwo),
            };
            subjectCaller = developerOne;

            subjectChipAdditionTwo = [
              {
                chipId: subjectChipIdTwo,
                chipOwner: subjectChipOwner,
                nameHash: calculateLabelHash(subjectChipIdTwo),
                manufacturerValidation: subjectManufacturerValidationTwo,
              } as ProjectChipAddition,
            ]

          });

          it("should add the second chip", async () => {
            await subject();

            await projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAdditionTwo);

            const actualNamehash = (await chipRegistry.chipEnrollments(subjectChipIdTwo)).nameHash;
            expect(actualNamehash).to.eq(calculateLabelHash(subjectChipIdTwo));
          });
       
        });

        describe("when the chip has already been added", async () => {
          beforeEach(async () => {
            await subject();
          });

          it("should revert", async () => {
            // TODO: better mock test here to check for "Chip already added"
            await expect(subject()).to.be.revertedWith("Chip already added");
          });
        });

        // TODO: move away from redirect registrar for testing which always sets owner.
        // describe("when the chip owner is the zero address", async () => {
        //   beforeEach(async () => {
        //     subjectChipOwner = ADDRESS_ZERO;
        //   });

        //   it("should revert", async () => {
        //     await expect(subject()).to.be.revertedWith("Invalid chip owner");
        //   });
        // });

        describe("when the project has not been enrolled", async () => {
          beforeEach(async () => {
            subjectCaller = developerTwo;
          });

          it("should revert", async () => {
            // TODO: better mock test here to check for "Project not enrolled"
            await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
          });
        });

        describe("when the manufacturer certificate is invalid", async () => {
          beforeEach(async () => {
            subjectManufacturerValidationOne = {
              enrollmentId: chipsEnrollmentId,
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, owner.address),
            };
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Chip not enrolled with ManufacturerRegistry");
          });
        });

      });
    });
  });

  describe("updateMaxLockinPeriod", async () => {
    let subjectMaxLockinPeriod: BigNumber;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectMaxLockinPeriod = ONE_DAY_IN_SECONDS.mul(30);
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return chipRegistry.connect(subjectCaller.wallet).updateMaxLockinPeriod(subjectMaxLockinPeriod);
    }

    it("should update the max lockin period", async () => {
      const preMaxLockinPeriod = await chipRegistry.maxLockinPeriod();
      expect(preMaxLockinPeriod).to.not.eq(subjectMaxLockinPeriod);

      await subject();

      const postMaxLockinPeriod = await chipRegistry.maxLockinPeriod();
      expect(postMaxLockinPeriod).to.eq(subjectMaxLockinPeriod);
    });

    it("should emit the correct MaxLockinPeriodUpdated event", async () => {
      await expect(subject()).to.emit(chipRegistry, "MaxLockinPeriodUpdated").withArgs(subjectMaxLockinPeriod);
    });

    describe("when the new max lockin period is 0", async () => {
      beforeEach(async () => {
        subjectMaxLockinPeriod = ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid lockin period");
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
