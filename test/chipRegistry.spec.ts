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
  DeveloperRegistryMock,
  DeveloperRegistrar,
  DeveloperRegistrarFactory,
  PBTSimpleProjectRegistrar,
  EnrollmentSECP256k1Model
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
  createDeveloperCustodyProof,
  createMigrationProof
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
  let nameGovernor: Account;
  let migrationSigner: Account;

  let manufacturerRegistry: ManufacturerRegistry;
  let enrollmentAuthModel: EnrollmentSECP256k1Model;
  let ersRegistry: ERSRegistry;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let developerRegistry: DeveloperRegistryMock;
  let servicesRegistry: ServicesRegistry;
  let chipRegistry: ChipRegistry;
  let developerRegistrarImpl: DeveloperRegistrar;
  let developerRegistrar: DeveloperRegistrar;
  let projectRegistrarOne: PBTSimpleProjectRegistrar;
  let projectRegistrarTwo: PBTSimpleProjectRegistrar;
  let projectRegistrarThree: PBTSimpleProjectRegistrar;

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
      nameGovernor,
      migrationSigner,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);
    blockchain = new Blockchain(ethers.provider);
    chainId = await blockchain.getChainId();

    manufacturerRegistry = await deployer.deployManufacturerRegistry(owner.address);
    enrollmentAuthModel = await deployer.deployEnrollmentSECP256k1Model();

    chipRegistry = await deployer.deployChipRegistry(
      manufacturerRegistry.address,
      BigNumber.from(1000),
      migrationSigner.address
    );

    developerRegistry = await deployer.mocks.deployDeveloperRegistryMock(owner.address);
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    servicesRegistry = await deployer.deployServicesRegistry(chipRegistry.address);

    await developerRegistry.initialize(ersRegistry.address, [], nameGovernor.address);

    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

    manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
    await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

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
    await developerRegistry.addRegistrarFactory(developerRegistrarFactory.address);

    await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
      manufacturerId,
      manufacturerOne.address,
      manufacturerOne.address,      // Placeholder
      enrollmentAuthModel.address,
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
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    let subjectManufacturerRegistry: Address;
    let subjectMaxLockinPeriod: BigNumber;
    let subjectMigrationSigner: Address;

    beforeEach(async () => {
      subjectManufacturerRegistry = manufacturerRegistry.address;
      subjectMaxLockinPeriod = BigNumber.from(1000);
      subjectMigrationSigner = migrationSigner.address;
    });

    async function subject(): Promise<any> {
      return deployer.deployChipRegistry(
        subjectManufacturerRegistry,
        subjectMaxLockinPeriod,
        subjectMigrationSigner
      );
    }

    it("should set the correct initial state", async () => {
      const chipRegistryDeploy: ChipRegistry = await subject();

      const actualManufacturerRegistry = await chipRegistryDeploy.manufacturerRegistry();
      const actualMaxLockinPeriod = await chipRegistryDeploy.maxLockinPeriod();
      const actualMigrationSigner = await chipRegistryDeploy.migrationSigner();

      expect(actualManufacturerRegistry).to.eq(manufacturerRegistry.address);
      expect(actualMaxLockinPeriod).to.eq(BigNumber.from(1000));
      expect(actualMigrationSigner).to.eq(migrationSigner.address);
    });

    describe("when the passed manufacturerRegistry address is the zero address", async () => {
      beforeEach(async () => {
        subjectManufacturerRegistry = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid manufacturer registry address");
      });
    });

    describe("when the max lockin period is greater than 10 years", async () => {
      beforeEach(async () => {
        subjectMaxLockinPeriod = BigNumber.from(315569521);
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("maxLockinPeriod cannot exceed 10 years");
      });
    });

    describe("when the passed migrationSigner address is the zero address", async () => {
      beforeEach(async () => {
        subjectMigrationSigner = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid migration signer address");
      });
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

  context("when the ChipRegistry is initialized", async () => {
    beforeEach(async () => {
      await chipRegistry.initialize(ersRegistry.address, developerRegistry.address);
    });

    describe("#addProjectEnrollment", async () => {
      let subjectProjectRegistrar: Address;
      let subjectNameHash: string;
      let subjectServicesRegistry: Address;
      let subjectServiceId: string;
      let subjectLockinPeriod: BigNumber;
      let subjectCaller: Account;

      beforeEach(async () => {
        const mockNameHash = calculateLabelHash("mockDeveloper");
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerOne.address, mockNameHash);

        await developerRegistry.addMockRegistrar(owner.address, mockNameHash);

        developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        projectRegistrarOne = await deployer.deployPBTSimpleProjectRegistrar(
          chipRegistry.address,
          ersRegistry.address,
          developerRegistrar.address,
          "ProjectX",
          "PRX",
          "https://projectx.com/",
          BigNumber.from(5),
          ADDRESS_ZERO
        );

        subjectNameHash = calculateLabelHash("ProjectX");
        subjectProjectRegistrar = projectRegistrarOne.address;
        subjectServicesRegistry = servicesRegistry.address;
        subjectServiceId = serviceId;
        subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return chipRegistry.connect(subjectCaller.wallet).addProjectEnrollment(
          subjectProjectRegistrar,
          subjectNameHash,
          subjectServicesRegistry,
          subjectServiceId,
          subjectLockinPeriod
        );
      }

      it("should add the project enrollment", async () => {
        await subject();

        const actualProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);
        const projectCreationTimestamp = await blockchain.getCurrentTimestamp();

        expect(actualProjectInfo.nameHash).to.eq(subjectNameHash);
        expect(actualProjectInfo.developerRegistrar).to.eq(developerRegistrar.address);
        expect(actualProjectInfo.servicesRegistry).to.eq(servicesRegistry.address);
        expect(actualProjectInfo.serviceId).to.eq(subjectServiceId);
        expect(actualProjectInfo.lockinPeriod).to.eq(subjectLockinPeriod);
        expect(actualProjectInfo.creationTimestamp).to.eq(projectCreationTimestamp);
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
          await expect(subject()).to.be.revertedWith("Must be Developer Registrar");
        });
      });

      describe("when the serviceId does not exist", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("NonExistentService");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service does not exist");
        });
      });

      describe("when the project registrar does not implement IProjectRegistrar", async () => {
        beforeEach(async () => {
          const simplePBT = await deployer.mocks.deployPBTSimpleMock(
            "PBTMock",
            "PBTM",
            "https://pbtmock.com/",
            BigNumber.from(5),
            ADDRESS_ZERO
          );
          subjectProjectRegistrar = simplePBT.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Does not implement IProjectRegistrar");
        });
      });

      describe("when the services registry does not implement IServicesRegistry", async () => {
        beforeEach(async () => {
          subjectServicesRegistry = projectRegistrarOne.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Does not implement IServicesRegistry");
        });
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
          await expect(subject()).to.be.revertedWith("Invalid project registrar address");
        });
      });
    });

    describe("#addChip", async () => {
      let subjectProjectRegistrar: ProjectRegistrarMock | PBTSimpleProjectRegistrar;
      let subjectChipAddition: ProjectChipAddition[];
      let subjectCaller: Account;

      let lockinPeriod: BigNumber;

      beforeEach(async () => {
        const mockNameHash = calculateLabelHash("mockDeveloper2");
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerTwo.address, mockNameHash);

        await developerRegistry.connect(developerTwo.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
        developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        const transferPolicy = ADDRESS_ZERO;
        subjectCaller = developerTwo;

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

        await projectRegistrarTwo.connect(owner.wallet).transferOwnership(developerTwo.address);
        await projectRegistrarTwo.connect(developerTwo.wallet).acceptOwnership();

        const nameHash = calculateLabelHash("ProjectY");

        lockinPeriod = BigNumber.from(100);

        await developerRegistrar.connect(developerTwo.wallet).addProject(
          projectRegistrarTwo.address,
          nameHash,
          serviceId,
          lockinPeriod
        );

        const manufacturerValidation = {
          enrollmentId: chipsEnrollmentId,
          manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address, enrollmentAuthModel.address),
          payload: "0x",
        };
        const custodyProofChip = await createDeveloperCustodyProof(chipOne, developerRegistrar.address, chainId, chipRegistry.address);
        subjectChipAddition = [
          {
            chipId: chipOne.address,
            chipOwner: developerOne.address,
            nameHash: calculateLabelHash(chipOne.address),
            manufacturerValidation,
            custodyProof: custodyProofChip,
          } as ProjectChipAddition,
        ];
        subjectProjectRegistrar = projectRegistrarTwo;
      });

      async function subject(): Promise<any> {
        return subjectProjectRegistrar.connect(subjectCaller.wallet).addChips(
          subjectChipAddition
        );
      }

      it("should add the chip and set chip state", async () => {
        await subject();

        const actualChipInfo = (await chipRegistry.chipEnrollments(subjectChipAddition[0].chipId)).chipEnrolled;
        expect(actualChipInfo).to.eq(true);
      });

      it("should set the chip owner and update owner balances", async () => {
        await subject();

        const actualChipOwner = (await chipRegistry.ownerOf(subjectChipAddition[0].chipId));
        expect(actualChipOwner).to.eq(developerOne.address);
      });

      it("should map chip id to the namehash", async () => {
        await subject();

        const actualNamehash = (await chipRegistry.chipEnrollments(subjectChipAddition[0].chipId)).nameHash;
        expect(actualNamehash).to.eq(calculateLabelHash(subjectChipAddition[0].chipId));
      });

      it("should set the project's chipsAdded field to true", async () => {
        const preProjectInfo = await chipRegistry.projectEnrollments(projectRegistrarTwo.address);
        expect(preProjectInfo.chipsAdded).to.be.false;

        await subject();

        const postProjectInfo = await chipRegistry.projectEnrollments(projectRegistrarTwo.address);
        expect(postProjectInfo.chipsAdded).to.be.true;
      });

      it("should update state on the ServicesRegistry", async () => {
        await subject();

        const chipServices = await servicesRegistry.chipServices(subjectChipAddition[0].chipId);
        const projectCreationTimestamp = (await chipRegistry.projectEnrollments(projectRegistrarTwo.address)).creationTimestamp;

        expect(chipServices.primaryService).to.eq(ethers.utils.formatBytes32String("Gucci-Flex"));
        expect(chipServices.serviceTimelock).to.eq(lockinPeriod.add(projectCreationTimestamp));
      });

      it("should emit a ChipAdded event", async () => {
        await expect(subject()).to.emit(chipRegistry, "ChipAdded").withArgs(
          subjectChipAddition[0].chipId,
          projectRegistrarTwo.address,
          subjectChipAddition[0].manufacturerValidation.enrollmentId,
          subjectChipAddition[0].chipOwner,
          ethers.utils.formatBytes32String("Gucci-Flex"),
          calculateSubnodeHash(`${subjectChipAddition[0].chipId}.ProjectY.mockDeveloper2.ers`),
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
          const creationTimestamp = (await chipRegistry.projectEnrollments(projectRegistrarTwo.address)).creationTimestamp;

          await subject();

          const chipServices = await servicesRegistry.chipServices(subjectChipAddition[0].chipId);

          expect(chipServices.serviceTimelock).to.eq(creationTimestamp.add(newMaxTimelock));
        });
      });

      describe("when the custody proof is invalid", async () => {
        beforeEach(async () => {
          subjectChipAddition[0].custodyProof = await createMigrationProof(migrationSigner, chipOne.address, chainId, chipRegistry.address);
        });

        it("should emit a ChipAdded event with isDeveloperCustodyProof false", async () => {
          await expect(subject()).to.emit(chipRegistry, "ChipAdded").withArgs(
            subjectChipAddition[0].chipId,
            projectRegistrarTwo.address,
            subjectChipAddition[0].manufacturerValidation.enrollmentId,
            subjectChipAddition[0].chipOwner,
            ethers.utils.formatBytes32String("Gucci-Flex"),
            calculateSubnodeHash(`${subjectChipAddition[0].chipId}.ProjectY.mockDeveloper2.ers`),
            false
          );
        });
      });

      describe("when a second chip is being added to a project", async () => {
        beforeEach(async () => {
          await subject();

          const chipOwner = developerOne.address;

          const manufacturerValidationTwo = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipTwo.address, enrollmentAuthModel.address),
            payload: "0x",
          };
          subjectCaller = developerTwo;

          subjectChipAddition = [
            {
              chipId: chipTwo.address,
              chipOwner,
              nameHash: calculateLabelHash(chipTwo.address),
              manufacturerValidation: manufacturerValidationTwo,
              custodyProof: await createDeveloperCustodyProof(chipTwo, developerRegistrar.address, chainId, chipRegistry.address),
            } as ProjectChipAddition,
          ];
        });

        it("should add the second chip", async () => {
          await subject();

          const actualNamehash = (await chipRegistry.chipEnrollments(subjectChipAddition[0].chipId)).nameHash;
          expect(actualNamehash).to.eq(calculateLabelHash(subjectChipAddition[0].chipId));
        });
      });

      describe("when the chip Id is invalid", async () => {
        beforeEach(async () => {
          subjectChipAddition[0].chipId = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid chip");
        });
      });

      describe("when the chip has already been added", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip already added");
        });
      });

      describe("when the chip owner is the zero address", async () => {
        beforeEach(async () => {
          subjectChipAddition[0].chipOwner = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid chip owner");
        });
      });

      describe("when the project has not been enrolled", async () => {
        beforeEach(async () => {
          const unusedProjectRegistrar = await deployer.deployPBTSimpleProjectRegistrar(
            chipRegistry.address,
            ersRegistry.address,
            developerRegistrar.address,
            "ProjectZ",
            "PRZ",
            "https://projectz.com/",
            BigNumber.from(5),
            ADDRESS_ZERO
          );
          subjectProjectRegistrar = unusedProjectRegistrar;

          subjectCaller = owner;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Project not enrolled");
        });
      });

      describe("when the manufacturer certificate is invalid", async () => {
        beforeEach(async () => {
          subjectChipAddition[0].manufacturerValidation = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, owner.address, enrollmentAuthModel.address),
            payload: "0x",
          };
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip not enrolled with ManufacturerRegistry");
        });
      });

      describe("when the manufacturer enrollment is expired", async () => {
        beforeEach(async () => {
          await manufacturerRegistry.connect(manufacturerOne.wallet).updateChipEnrollment(
            manufacturerId,
            false,
            chipsEnrollmentId
          );
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Expired manufacturer enrollment");
        });
      });

      describe("when the custody proof is invalid", async () => {
        beforeEach(async () => {
          // Set to developerTwo address in order to create a bad custodyProof
          subjectChipAddition[0].custodyProof = await createDeveloperCustodyProof(chipOne, developerTwo.address, chainId, chipRegistry.address);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid custody proof");
        });
      });

    });

    describe.only("#removeProjectEnrollment", async () => {
      let subjectProjectRegistrar: Address;
      let subjectCaller: Account;

      let testDeveloperRegistrar: DeveloperRegistrar;
      let nameHash: string;
      let projectServiceId: string;
      let lockinPeriod: BigNumber;
      let chipId: Address;
      let chipOwner: Address;
      let manufacturerValidation: ManufacturerValidationInfo;
      let custodyProofChip: string;

      beforeEach(async () => {
        const mockNameHash = calculateLabelHash("mockDeveloper3");
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerOne.address, mockNameHash);

        await developerRegistry.connect(developerOne.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
        testDeveloperRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        projectRegistrarThree = await deployer.deployPBTSimpleProjectRegistrar(
          chipRegistry.address,
          ersRegistry.address,
          testDeveloperRegistrar.address,
          "ProjectA",
          "PRA",
          "https://projecta.com/",
          BigNumber.from(5),
          ADDRESS_ZERO
        );

        nameHash = calculateLabelHash("ProjectA");
        projectServiceId = serviceId;
        lockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
        chipOwner = developerOne.address;

        chipId = chipOne.address;
        manufacturerValidation = {
          enrollmentId: chipsEnrollmentId,
          manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipId, enrollmentAuthModel.address),
          payload: "0x",
        };
        custodyProofChip = await createDeveloperCustodyProof(chipOne, testDeveloperRegistrar.address, chainId, chipRegistry.address);

        subjectProjectRegistrar = projectRegistrarThree.address;
        subjectCaller = developerOne;

        await testDeveloperRegistrar.connect(subjectCaller.wallet).addProject(
          subjectProjectRegistrar,
          nameHash,
          projectServiceId,
          lockinPeriod
        );
      });

      async function subject(): Promise<any> {
        return testDeveloperRegistrar.connect(subjectCaller.wallet).removeProject(subjectProjectRegistrar);
      }

      async function subjectCallDirectly(): Promise<any> {
        return chipRegistry.connect(subjectCaller.wallet).removeProjectEnrollment(subjectProjectRegistrar);
      }

      it("should remove the project enrollment", async () => {
        await subject();

        const actualProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);
        expect(actualProjectInfo.creationTimestamp).to.eq(0);
        expect(actualProjectInfo.nameHash).to.eq(NULL_NODE);
      });

      it("should emit the correct ProjectEnrollmentRemoved event", async () => {
        await expect(subject()).to.emit(chipRegistry, "ProjectEnrollmentRemoved").withArgs(
          testDeveloperRegistrar.address,
          subjectProjectRegistrar,
          nameHash
        );
      });

      describe("should not remove the project enrollment if chips are added", async () => {
        beforeEach(async () => {
          await projectRegistrarThree.connect(owner.wallet).addChips(
            [
              {
                chipId,
                chipOwner,
                nameHash: calculateLabelHash(chipId),
                manufacturerValidation,
                custodyProof: custodyProofChip,
              } as ProjectChipAddition,
            ]
          );
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Cannot remove project with chips added");
        });
      });

      describe("when the passed project registrar is invalid", async () => {
        beforeEach(async () => {
          subjectProjectRegistrar = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid project registrar address");
        });
      });

      describe("when the passed project registrar is not enrolled", async () => {
        beforeEach(async () => {
          const newDeveloperRegistrar = await deployer.mocks.deployDeveloperRegistrarMock(
            chipRegistry.address,
            ersRegistry.address,
            developerRegistry.address,
            servicesRegistry.address
          );

          const projectRegistrarFour = await deployer.deployPBTSimpleProjectRegistrar(
            chipRegistry.address,
            ersRegistry.address,
            newDeveloperRegistrar.address,
            "ProjectB",
            "PRB",
            "https://projectb.com/",
            BigNumber.from(5),
            ADDRESS_ZERO
          );
          await developerRegistry.addMockRegistrar(newDeveloperRegistrar.address, calculateLabelHash("nike"));

          await newDeveloperRegistrar.connect(owner.wallet).addMaliciousProject(
            projectRegistrarFour.address,
            nameHash
          );
          testDeveloperRegistrar = newDeveloperRegistrar;
          subjectProjectRegistrar = projectRegistrarFour.address;
          subjectCaller = owner;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Project not enrolled");
        });
      });

      describe("should not remove a project enrolled by another developer", async () => {
        beforeEach(async () => {
          const newDeveloperRegistrar = await deployer.mocks.deployDeveloperRegistrarMock(
            chipRegistry.address,
            ersRegistry.address,
            developerRegistry.address,
            servicesRegistry.address
          );

          await developerRegistry.addMockRegistrar(newDeveloperRegistrar.address, calculateLabelHash("nike"));

          await newDeveloperRegistrar.connect(owner.wallet).addMaliciousProject(
            projectRegistrarThree.address,
            nameHash
          );
          testDeveloperRegistrar = newDeveloperRegistrar;
          subjectCaller = owner;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Developer Registrar does not own project");
        });
      });

      describe("when the caller is not a developer registrar", async () => {
        beforeEach(async () => {
          subjectCaller = owner;
        });

        it("should revert", async () => {
          await expect(subjectCallDirectly()).to.be.revertedWith("Must be Developer Registrar");
        });
      });
    });

    describe("#setChipNodeOwner", async () => {
      let subjectChipId: Address;
      let subjectNewOwner: Address;
      let subjectCaller: Account;

      let projectRegistrar: ProjectRegistrarMock;

      beforeEach(async () => {
        const mockNameHash = calculateLabelHash("mockDeveloper2");
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerTwo.address, mockNameHash);

        await developerRegistry.connect(developerTwo.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
        developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        subjectCaller = developerTwo;

        projectRegistrar = await deployer.mocks.deployProjectRegistrarMock(
          chipRegistry.address,
          ersRegistry.address,
          developerRegistrar.address
        );
        await projectRegistrar.connect(owner.wallet).transferOwnership(developerTwo.address);
        await projectRegistrar.connect(developerTwo.wallet).acceptOwnership();

        const nameHash = calculateLabelHash("ProjectY");

        const lockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);

        await developerRegistrar.connect(developerTwo.wallet).addProject(
          projectRegistrar.address,
          nameHash,
          serviceId,
          lockinPeriod
        );

        const manufacturerValidation = {
          enrollmentId: chipsEnrollmentId,
          manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address, enrollmentAuthModel.address),
          payload: "0x",
        };
        const custodyProofChip = await createDeveloperCustodyProof(chipOne, developerRegistrar.address, chainId, chipRegistry.address);
        const chipAddition = [
          {
            chipId: chipOne.address,
            chipOwner: developerOne.address,
            nameHash: calculateLabelHash(chipOne.address),
            manufacturerValidation,
            custodyProof: custodyProofChip,
          } as ProjectChipAddition,
        ];

        await projectRegistrar.connect(subjectCaller.wallet).addChips(chipAddition);

        subjectChipId = chipOne.address;
        subjectNewOwner = developerTwo.address;
      });

      async function subject(): Promise<any> {
        return projectRegistrar.connect(subjectCaller.wallet).setChipNodeOwnerMock(subjectChipId, subjectNewOwner);
      }

      async function subjectCallDirectly(): Promise<any> {
        return chipRegistry.connect(subjectCaller.wallet).setChipNodeOwner  (subjectChipId, subjectNewOwner);
      }

      it("should set the chip owner", async () => {
        await subject();

        const actualNodeOwner = (await ersRegistry.getOwner(calculateSubnodeHash(`${subjectChipId}.ProjectY.mockDeveloper2.ers`)));
        expect(actualNodeOwner).to.eq(subjectNewOwner);
      });

      describe("when the chip hasn't been added yet", async () => {
        beforeEach(async () => {
          subjectChipId = chipTwo.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip not added");
        });
      });

      describe("when the calling ProjectRegistrar is not the chip owner", async () => {
        beforeEach(async () => {
          subjectCaller = developerOne;
        });

        it("should revert", async () => {
          await expect(subjectCallDirectly()).to.be.revertedWith("ProjectRegistrar did not add chip");
        });
      });
    });

    describe("#resolveChip", async () => {
      let subjectChipId: Address;
      let subjectCaller: Account;

      let hasBeenAdded = true;

      beforeEach(async () => {
        const mockNameHash = calculateLabelHash("mockDeveloper2");
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerTwo.address, mockNameHash);

        await developerRegistry.connect(developerTwo.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
        developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        subjectCaller = developerTwo;

        const projectRegistrar = await deployer.mocks.deployProjectRegistrarMock(
          chipRegistry.address,
          ersRegistry.address,
          developerRegistrar.address
        );
        await projectRegistrar.connect(owner.wallet).transferOwnership(developerTwo.address);
        await projectRegistrar.connect(developerTwo.wallet).acceptOwnership();

        const nameHash = calculateLabelHash("ProjectY");

        const lockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);

        await developerRegistrar.connect(developerTwo.wallet).addProject(
          projectRegistrar.address,
          nameHash,
          serviceId,
          lockinPeriod
        );


        const manufacturerValidation = {
          enrollmentId: chipsEnrollmentId,
          manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address, enrollmentAuthModel.address),
          payload: "0x",
        };
        const custodyProofChip = await createDeveloperCustodyProof(chipOne, developerRegistrar.address, chainId, chipRegistry.address);
        const chipAddition = [
          {
            chipId: chipOne.address,
            chipOwner: developerOne.address,
            nameHash: calculateLabelHash(chipOne.address),
            manufacturerValidation,
            custodyProof: custodyProofChip,
          } as ProjectChipAddition,
        ];

        if (hasBeenAdded) {
          await projectRegistrar.connect(subjectCaller.wallet).addChips(chipAddition);
        }

        subjectChipId = chipOne.address;
      });

      async function subject(): Promise<any> {
        return chipRegistry.connect(subjectCaller.wallet).resolveChip(subjectChipId);
      }

      it("should return the right content from the primary service", async () => {
        const content: ServiceRecord[] = await subject();

        expect(content[0].recordType).to.eq(serviceRecords[0].recordType);
        expect(ethers.utils.toUtf8String(content[0].content)).to.eq(ethers.utils.toUtf8String(serviceRecords[0].content) + subjectChipId.toLowerCase());
        expect(content[1].recordType).to.eq(serviceRecords[1].recordType);
        expect(content[1].content).to.eq(serviceRecords[1].content);
      });

      describe("when the chip hasn't been added yet", async () => {
        beforeEach(async () => {
          subjectChipId = chipTwo.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip not added");
        });
      });
    });

    describe("#node", async () => {
      let subjectChipId: Address;
      let subjectCaller: Account;

      beforeEach(async () => {
        const mockNameHash = calculateLabelHash("mockDeveloper2");
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerTwo.address, mockNameHash);

        await developerRegistry.connect(developerTwo.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
        developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        subjectCaller = developerTwo;

        const projectRegistrar = await deployer.mocks.deployProjectRegistrarMock(
          chipRegistry.address,
          ersRegistry.address,
          developerRegistrar.address
        );
        await projectRegistrar.connect(owner.wallet).transferOwnership(developerTwo.address);
        await projectRegistrar.connect(developerTwo.wallet).acceptOwnership();

        const nameHash = calculateLabelHash("ProjectY");

        const lockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);

        await developerRegistrar.connect(developerTwo.wallet).addProject(
          projectRegistrar.address,
          nameHash,
          serviceId,
          lockinPeriod
        );

        const manufacturerValidation = {
          enrollmentId: chipsEnrollmentId,
          manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address, enrollmentAuthModel.address),
          payload: "0x",
        };
        const custodyProofChip = await createDeveloperCustodyProof(chipOne, developerRegistrar.address, chainId, chipRegistry.address);
        const chipAddition = [
          {
            chipId: chipOne.address,
            chipOwner: developerOne.address,
            nameHash: calculateLabelHash(chipOne.address),
            manufacturerValidation,
            custodyProof: custodyProofChip,
          } as ProjectChipAddition,
        ];

        await projectRegistrar.connect(subjectCaller.wallet).addChips(chipAddition);

        subjectChipId = chipOne.address;
      });

      async function subject(): Promise<any> {
        return chipRegistry.connect(subjectCaller.wallet).node(subjectChipId);
      }

      it("should return the right node", async () => {
        const node = await subject();

        expect(node).to.eq(calculateSubnodeHash(`${subjectChipId}.ProjectY.mockDeveloper2.ers`));
      });

      describe("when the chip hasn't been added yet", async () => {
        beforeEach(async () => {
          subjectChipId = chipTwo.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip not added");
        });
      });
    });

    describe("#ownerOf", async () => {
      let subjectChipId: Address;

      beforeEach(async () => {
        const mockNameHash = calculateLabelHash("mockDeveloper2");
        await developerRegistry.connect(nameGovernor.wallet).addAllowedDeveloper(developerTwo.address, mockNameHash);

        await developerRegistry.connect(developerTwo.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
        developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

        const projectRegistrar = await deployer.mocks.deployProjectRegistrarMock(
          chipRegistry.address,
          ersRegistry.address,
          developerRegistrar.address
        );
        await projectRegistrar.connect(owner.wallet).transferOwnership(developerTwo.address);
        await projectRegistrar.connect(developerTwo.wallet).acceptOwnership();

        const nameHash = calculateLabelHash("ProjectY");

        const lockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);

        await developerRegistrar.connect(developerTwo.wallet).addProject(
          projectRegistrar.address,
          nameHash,
          serviceId,
          lockinPeriod
        );

        const manufacturerValidation = {
          enrollmentId: chipsEnrollmentId,
          manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address, enrollmentAuthModel.address),
          payload: "0x",
        };
        const custodyProofChip = await createDeveloperCustodyProof(chipOne, developerRegistrar.address, chainId, chipRegistry.address);
        const chipAddition = [
          {
            chipId: chipOne.address,
            chipOwner: developerOne.address,
            nameHash: calculateLabelHash(chipOne.address),
            manufacturerValidation,
            custodyProof: custodyProofChip,
          } as ProjectChipAddition,
        ];

        await projectRegistrar.connect(developerTwo.wallet).addChips(chipAddition);

        subjectChipId = chipOne.address;
      });

      async function subject(): Promise<any> {
        return chipRegistry.ownerOf(subjectChipId);
      }

      it("should return the right PBT owner from the ProjectReistrar", async () => {
        const node = await subject();

        expect(node).to.eq(developerOne.address);
      });

      describe("when the chip hasn't been added yet", async () => {
        beforeEach(async () => {
          subjectChipId = chipTwo.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip not added");
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

  describe("updateMigrationSigner", async () => {
    let subjectMigrationSigner: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectMigrationSigner = owner.address;
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return chipRegistry.connect(subjectCaller.wallet).updateMigrationSigner(subjectMigrationSigner);
    }

    it("should update the max lockin period", async () => {
      const preMigrationSigner = await chipRegistry.migrationSigner();
      expect(preMigrationSigner).to.eq(migrationSigner.address);

      await subject();

      const postMigrationSigner = await chipRegistry.migrationSigner();
      expect(postMigrationSigner).to.eq(subjectMigrationSigner);
    });

    it("should emit the correct MigrationSignerUpdated event", async () => {
      await expect(subject()).to.emit(chipRegistry, "MigrationSignerUpdated").withArgs(subjectMigrationSigner);
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
