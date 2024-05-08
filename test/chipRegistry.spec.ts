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
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  DeveloperRegistry,
  PBTSimpleProjectRegistrar
} from "@utils/contracts";
import { ADDRESS_ZERO, NULL_NODE, ONE_DAY_IN_SECONDS, ZERO } from "@utils/constants";
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
  createDeveloperCustodyProof
} from "@utils/protocolUtils";
import { Blockchain } from "@utils/common";

const expect = getWaffleExpect();

describe("ChipRegistry", () => {
  let owner: Account;
  let developerOne: Account;
  let developerTwo: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let chipFour: Account;
  let chipFive: Account;
  let nameGovernor: Account;
  let migrationSigner: Account;

  let manufacturerRegistry: ManufacturerRegistry;
  let ersRegistry: ERSRegistry;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let developerRegistry: DeveloperRegistry;
  let servicesRegistry: ServicesRegistry;
  let chipRegistry: ChipRegistry;
  let developerRegistrar: DeveloperRegistrar;
  let projectRegistrarOne: ProjectRegistrarMock;
  let projectRegistrarTwo: PBTSimpleProjectRegistrar;
  let projectRegistrarThree: ProjectRegistrarMock;
  let projectRegistrarFour: ProjectRegistrarMock;

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
      chipFour,
      chipFive,
      nameGovernor,
      migrationSigner,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);
    blockchain = new Blockchain(ethers.provider);
    chainId = await blockchain.getChainId();

    manufacturerRegistry = await deployer.deployManufacturerRegistry(owner.address);

    chipRegistry = await deployer.deployChipRegistry(
      manufacturerRegistry.address,
      BigNumber.from(1000),
      migrationSigner.address
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
      developerRegistry.address,
      servicesRegistry.address
    );
    await developerRegistry.addRegistrarFactory(developerRegistrarFactory.address);

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
    let subjectDeveloperRegistry: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectERSRegistry = ersRegistry.address;
      subjectDeveloperRegistry = developerRegistry.address;
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return chipRegistry.connect(subjectCaller.wallet).initialize(
        subjectERSRegistry,
        subjectDeveloperRegistry
      );
    }

    it("should set the correct initial state", async () => {
      await subject();

      const actualErsRegistry = await chipRegistry.ers();
      const actualDeveloperRegistry = await chipRegistry.developerRegistry();
      const isInitialized = await chipRegistry.initialized();

      expect(actualErsRegistry).to.eq(ersRegistry.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
      expect(isInitialized).to.be.true;
    });

    it("should emit a RegistryInitialized event", async () => {
      await expect(subject()).to.emit(chipRegistry, "RegistryInitialized").withArgs(
        subjectERSRegistry,
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
      await chipRegistry.initialize(ersRegistry.address, developerRegistry.address);
    });

    describe("#addProjectEnrollment", async () => {
      let subjectProjectRegistrar: Address;
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
        subjectServiceId = serviceId;
        subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
        subjectCaller = developerOne;
      });

      async function subject(): Promise<any> {
        return developerRegistrar.connect(subjectCaller.wallet).addProject(
          subjectProjectRegistrar,
          subjectNameHash,
          subjectServiceId,
          subjectLockinPeriod
        );
      }

      it("should add the project enrollment", async () => {
        await subject();

        const actualProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);

        expect(actualProjectInfo.nameHash).to.eq(subjectNameHash);
        expect(actualProjectInfo.developerRegistrar).to.eq(developerRegistrar.address);
        expect(actualProjectInfo.servicesRegistry).to.eq(servicesRegistry.address);
        expect(actualProjectInfo.serviceId).to.eq(subjectServiceId);
        expect(actualProjectInfo.lockinPeriod).to.eq(subjectLockinPeriod);
        expect(actualProjectInfo.creationTimestamp).to.eq(await blockchain.getCurrentTimestamp());
        expect(actualProjectInfo.chipsAdded).to.be.false;
      });

      it("should emit the correct ProjectEnrollmentAdded event", async () => {
        await expect(subject()).to.emit(chipRegistry, "ProjectEnrollmentAdded").withArgs(
          developerRegistrar.address,
          subjectProjectRegistrar,
          subjectNameHash,
          servicesRegistry.address,
          subjectServiceId
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

      describe("#addChip", async () => {
        let subjectChipIdOne: Address;
        let subjectChipIdTwo: Address;
        let subjectChipIdFour: Address;
        let subjectChipIdFive: Address;
        let subjectChipOwner: Address;
        let subjectManufacturerValidationOne: ManufacturerValidationInfo;
        let subjectManufacturerValidationTwo: ManufacturerValidationInfo;
        let subjectManufacturerValidationFour: ManufacturerValidationInfo;
        let subjectManufacturerValidationFive: ManufacturerValidationInfo;
        let subjectCustodyProofChipOne: string;
        let subjectCaller: Account;

        let subjectProjectRegistrar: Address;
        let subjectNameHash: string;
        let subjectServiceId: string;
        let subjectLockinPeriod: BigNumber;
        let subjectChipAdditionOne: ProjectChipAddition[];
        let subjectChipAdditionTwo: ProjectChipAddition[];
        let subjectChipAddition: ProjectChipAddition[];

        beforeEach(async () => {
          developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

          const transferPolicy = ADDRESS_ZERO;
          subjectCaller = developerOne;

          projectRegistrarTwo = await deployer.deployPBTSimpleProjectRegistrar(
            chipRegistry.address,
            ersRegistry.address,
            developerRegistrar.address,
            "ProjectY",
            "PRY",
            "https://projecty.com/",
            BigNumber.from(5),
            transferPolicy
          );
          await projectRegistrarTwo.connect(owner.wallet).transferOwnership(developerOne.address);

          subjectNameHash = calculateLabelHash("ProjectY");
          subjectProjectRegistrar = projectRegistrarTwo.address;

          subjectServiceId = serviceId;
          subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);

          await developerRegistrar.connect(subjectCaller.wallet).addProject(
            subjectProjectRegistrar,
            subjectNameHash,
            subjectServiceId,
            subjectLockinPeriod
          );

          subjectChipIdOne = chipOne.address;
          subjectManufacturerValidationOne = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address),
          };

          subjectCustodyProofChipOne = await createDeveloperCustodyProof(chipOne, developerOne.address);
          subjectChipOwner = developerOne.address;
        });

        async function subject(): Promise<any> {
          subjectChipAdditionOne = [
            {
              chipId: subjectChipIdOne,
              chipOwner: subjectChipOwner,
              nameHash: calculateLabelHash(subjectChipIdOne),
              manufacturerValidation: subjectManufacturerValidationOne,
              custodyProof: subjectCustodyProofChipOne,
            } as ProjectChipAddition,
          ];

          // One the mock, anyone can add a chip to a project.
          return projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAdditionOne);
        }

        it("should add the chip and set chip state", async () => {
          await subject();

          const actualChipInfo = (await chipRegistry.chipEnrollments(subjectChipIdOne)).chipEnrolled;
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
            subjectProjectRegistrar,
            subjectManufacturerValidationOne.enrollmentId,
            subjectChipOwner,
            ethers.utils.formatBytes32String("Gucci-Flex"),
            calculateSubnodeHash(`${subjectChipIdOne}.ProjectY.gucci.ers`),
            true
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
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, subjectChipIdTwo),
            };
            subjectCaller = developerOne;

            subjectChipAdditionTwo = [
              {
                chipId: subjectChipIdTwo,
                chipOwner: subjectChipOwner,
                nameHash: calculateLabelHash(subjectChipIdTwo),
                manufacturerValidation: subjectManufacturerValidationTwo,
                custodyProof: await createDeveloperCustodyProof(chipTwo, developerOne.address),
              } as ProjectChipAddition,
            ];

          });

          it("should add the second chip", async () => {
            await subject();

            await projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAdditionTwo);

            const actualNamehash = (await chipRegistry.chipEnrollments(subjectChipIdTwo)).nameHash;
            expect(actualNamehash).to.eq(calculateLabelHash(subjectChipIdTwo));
          });

        });

        describe("when multiple chips are added to a project", async () => {
          beforeEach(async () => {
            subjectChipIdFour = chipFour.address;
            subjectChipIdFive = chipFive.address;
            subjectChipOwner = developerOne.address;

            subjectManufacturerValidationFour = {
              enrollmentId: chipsEnrollmentId,
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, subjectChipIdFour),
            };
            subjectManufacturerValidationFive = {
              enrollmentId: chipsEnrollmentId,
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, subjectChipIdFive),
            };
            subjectCaller = developerOne;

            subjectChipAddition = [
              {
                chipId: subjectChipIdFour,
                chipOwner: subjectChipOwner,
                nameHash: calculateLabelHash(subjectChipIdFour),
                manufacturerValidation: subjectManufacturerValidationFour,
                custodyProof: await createDeveloperCustodyProof(chipFour, developerOne.address),
              } as ProjectChipAddition,
              {
                chipId: subjectChipIdFive,
                chipOwner: subjectChipOwner,
                nameHash: calculateLabelHash(subjectChipIdFive),
                manufacturerValidation: subjectManufacturerValidationFive,
                custodyProof: await createDeveloperCustodyProof(chipFive, developerOne.address),
              } as ProjectChipAddition,
            ];

          });

          it("should add multiple chips", async () => {
            await subject();

            await projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAddition);

            const actualNamehashFour = (await chipRegistry.chipEnrollments(subjectChipIdFour)).nameHash;
            const actualNamehashFive = (await chipRegistry.chipEnrollments(subjectChipIdFive)).nameHash;
            expect(actualNamehashFour).to.eq(calculateLabelHash(subjectChipIdFour));
            expect(actualNamehashFive).to.eq(calculateLabelHash(subjectChipIdFive));
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
        describe("when the chip owner is the zero address", async () => {
          beforeEach(async () => {
            subjectChipOwner = ADDRESS_ZERO;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Invalid chip owner");
          });
        });

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
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, owner.address),
            };
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Chip not enrolled with ManufacturerRegistry");
          });
        });

      });

      describe("#removeProjectEnrollment", async () => {
        let subjectProjectRegistrar: ProjectRegistrarMock;
        let subjectNameHash: string;
        let subjectCaller: Account;
        let subjectServiceId: string;
        let subjectLockinPeriod: BigNumber;
        let subjectChipIdOne: Address;
        let subjectChipOwner: Address;
        let subjectManufacturerValidationOne: ManufacturerValidationInfo;
        let subjectCustodyProofChipOne: string;

        beforeEach(async () => {
          developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

          projectRegistrarThree = await deployer.mocks.deployProjectRegistrarMock(
            chipRegistry.address,
            ersRegistry.address
          );

          projectRegistrarFour = await deployer.mocks.deployProjectRegistrarMock(
            chipRegistry.address,
            ersRegistry.address
          );

          subjectNameHash = calculateLabelHash("ProjectA");
          subjectProjectRegistrar = projectRegistrarThree;
          subjectServiceId = serviceId;
          subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
          subjectCaller = developerOne;
          subjectChipOwner = developerOne.address;

          subjectChipIdOne = chipOne.address;
          subjectManufacturerValidationOne = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, subjectChipIdOne),
          };
          subjectCustodyProofChipOne = await createDeveloperCustodyProof(chipOne, developerOne.address);

          await developerRegistrar.connect(subjectCaller.wallet).addProject(
            subjectProjectRegistrar.address,
            subjectNameHash,
            subjectServiceId,
            subjectLockinPeriod
          );

        });

        async function subject(): Promise<any> {
          return developerRegistrar.connect(subjectCaller.wallet).removeProject(subjectProjectRegistrar.address);
        }

        it("should remove the project enrollment", async () => {
          await subject();

          const actualProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar.address);
          expect(actualProjectInfo.creationTimestamp).to.eq(0);
          expect(actualProjectInfo.nameHash).to.eq(NULL_NODE);
        });

        it("should emit the correct ProjectEnrollmentRemoved event", async () => {
          await expect(subject()).to.emit(chipRegistry, "ProjectEnrollmentRemoved").withArgs(
            developerRegistrar.address,
            subjectProjectRegistrar.address,
            subjectNameHash
          );
        });

        describe("should not remove the project enrollment if chips are added", async () => {
          beforeEach(async () => {
            await subjectProjectRegistrar.connect(subjectCaller.wallet).addChip(
              subjectChipIdOne,
              subjectChipOwner,
              calculateLabelHash(subjectChipIdOne),
              subjectManufacturerValidationOne,
              subjectCustodyProofChipOne
            );
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Cannot remove project with chips added");
          });
        });

        describe("should not remove an unenrolled project", async () => {
          beforeEach(async () => {
            subjectProjectRegistrar = projectRegistrarFour;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Project not enrolled");
          });
        });

        describe("should not remove a project enrolled by another developer", async () => {
          beforeEach(async () => {
            await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerTwo.address, calculateLabelHash("nike"));
            await developerRegistry.connect(developerTwo.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);

            subjectProjectRegistrar = projectRegistrarFour;

            developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[1]);

            await developerRegistrar.connect(developerTwo.wallet).addProject(
              subjectProjectRegistrar.address,
              subjectNameHash,
              subjectServiceId,
              subjectLockinPeriod
            );
          });

          it("should revert", async () => {
            // TODO: actual revert should be Developer Registrar does not own project
            await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
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
