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
  RedirectProjectRegistrar
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
  createDeveloperCustodyProof,
  createDeveloperInclusionProof,
  createProjectOwnershipProof,
  createTokenData
} from "@utils/protocolUtils";
import { Blockchain, ManufacturerTree, DeveloperTree } from "@utils/common";
import { namehash } from "ethers/lib/utils";

const expect = getWaffleExpect();

describe.only("ChipRegistry", () => {
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
  let projectRegistrarTwo: RedirectProjectRegistrar;
  let projectRegistrarThree: ProjectRegistrarMock;

  let manufacturerId: string;
  let maxBlockWindow: BigNumber;
  let baseTokenUri: string;
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

    baseTokenUri = "www.resolve.com/";
    maxBlockWindow = BigNumber.from(4);
    chipRegistry = await deployer.deployChipRegistry(
      manufacturerRegistry.address,
      maxBlockWindow,
      BigNumber.from(1000),
      baseTokenUri
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
      const actualMaxBlockWindow = await chipRegistry.maxBlockWindow();

      expect(actualManufacturerRegistry).to.eq(manufacturerRegistry.address);
      expect(actualMaxBlockWindow).to.eq(maxBlockWindow);
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
      let subjectProjectPublicKey: Address;
      let subjectTransferPolicy: Address;
      let subjectProjectOwnershipProof: string;
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
        subjectProjectPublicKey = developerOne.address;
        subjectTransferPolicy = ADDRESS_ZERO;
        subjectServiceId = serviceId;
        subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
        subjectProjectOwnershipProof = await createProjectOwnershipProof(
          developerOne, 
          subjectProjectRegistrar, 
          await blockchain.getChainId()
        );
        subjectCaller = developerOne;
      });
  
      async function subject(): Promise<any> {
        return developerRegistrar.connect(subjectCaller.wallet).addProject(
          subjectNameHash,
          subjectProjectRegistrar,
          subjectProjectPublicKey,
          subjectServiceId, 
          subjectTransferPolicy,
          subjectLockinPeriod,
          subjectProjectOwnershipProof,
        );
      }

      it("should add the project enrollment", async () => {
        await subject();

        const actualProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);

        expect(actualProjectInfo.projectPublicKey).to.eq(subjectProjectPublicKey);
        expect(actualProjectInfo.transferPolicy).to.eq(subjectTransferPolicy);
        expect(actualProjectInfo.creationTimestamp).to.eq(await blockchain.getCurrentTimestamp());
        expect(actualProjectInfo.claimsStarted).to.be.false;
      });

      it("should emit the correct ProjectEnrollmentAdded event", async () => {
        await expect(subject()).to.emit(chipRegistry, "ProjectEnrollmentAdded").withArgs(
          developerRegistrar.address,
          subjectProjectRegistrar,
          subjectProjectPublicKey,
          subjectTransferPolicy,
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

        // TODO: review switching back to a mock here to validate original revert conditions.
        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Subnode already exists");
        });
      });

      describe("when the passed public key is the zero address", async () => {
        beforeEach(async () => {
          subjectProjectPublicKey = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid project public key");
        });
      });

      describe("when the passed signature is not signed by the project public key", async () => {
        beforeEach(async () => {
          subjectProjectOwnershipProof = await createProjectOwnershipProof(manufacturerOne, subjectProjectRegistrar, chainId);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid signature");
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
        let subjectProjectPublicKey: Address;
        let subjectTransferPolicy: Address;
        let subjectProjectOwnershipProof: string;
        let subjectNameHash: string;
        let subjectServiceId: string;
        let subjectLockinPeriod: BigNumber;
        let subjectChipAdditionOne: ProjectChipAddition[];
        let subjectChipAdditionTwo: ProjectChipAddition[];

        beforeEach(async () => {
          developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

          projectRegistrarTwo = await deployer.deployRedirectProjectRegistrar(
            developerOne.address,
            chipRegistry.address,
            ersRegistry.address,
            developerRegistrar.address
          );

          subjectNameHash = calculateLabelHash("ProjectY");
          subjectProjectRegistrar = projectRegistrarTwo.address;
          subjectProjectPublicKey = developerOne.address;
          subjectTransferPolicy = ADDRESS_ZERO;
          subjectServiceId = serviceId;
          subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
          subjectProjectOwnershipProof = await createProjectOwnershipProof(
            developerOne, 
            subjectProjectRegistrar, 
            await blockchain.getChainId()
          );
          subjectCaller = developerOne;

          await developerRegistrar.connect(subjectCaller.wallet).addProject(
            subjectNameHash,
            subjectProjectRegistrar,
            subjectProjectPublicKey,
            subjectServiceId, 
            subjectTransferPolicy,
            subjectLockinPeriod,
            subjectProjectOwnershipProof,
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
              nameHash: calculateLabelHash(subjectChipIdOne),
              manufacturerValidation: subjectManufacturerValidationOne,
            } as ProjectChipAddition,
          ]

          // One the mock, anyone can add a chip to a project.
          return projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAdditionOne);
        }

        it("should add the chip and set chip state", async () => {
          await subject();

          const actualChipTransferPolicy = await chipRegistry.chipTransferPolicy(chipOne.address);
          expect(actualChipTransferPolicy).to.eq(subjectTransferPolicy);
        });

        it("should set the chip owner and update owner balances", async () => {
          await subject();

          const actualChipOwner = (await chipRegistry.functions["ownerOf(address)"](subjectChipIdOne))[0];
          const actualOwnerBalance = await chipRegistry.balanceOf(developerOne.address);
          expect(actualChipOwner).to.eq(developerOne.address);
          expect(actualOwnerBalance).to.eq(ONE);
        });

        // TODO: check node <> chipId mapping.
        // it("should map the node to the chip id", async () => {
        //   await subject();

        //   const actualChipId = await chipRegistry.tokenIdToChipId(subjectChipId);
        //   expect(actualChipId).to.eq(subjectChipId);
        // });

        it("should set the project's claimsStarted field to true", async () => {
          const preProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);
          expect(preProjectInfo.claimsStarted).to.be.false;

          await subject();

          const postProjectInfo = await chipRegistry.projectEnrollments(subjectProjectRegistrar);
          expect(postProjectInfo.claimsStarted).to.be.true;
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
                nameHash: calculateLabelHash(subjectChipIdTwo),
                manufacturerValidation: subjectManufacturerValidationTwo,
              } as ProjectChipAddition,
            ]

          });

          it("should add the second chip", async () => {
            await subject();

            await projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAdditionTwo);

            const actualChipTransferPolicy = await chipRegistry.chipTransferPolicy(chipTwo.address);
            // TODO: verify token id mapping.
            // const actualChipTokenId = await chipRegistry.tokenIdToChipId(chipTwo.address);
            // expect(actualChipTokenId).to.eq();
            expect(actualChipTransferPolicy).to.eq(subjectTransferPolicy);
          });
        });

        describe("when the chip has already been added", async () => {
          beforeEach(async () => {
            await subject();
          });

          it("should revert", async () => {
            // TODO: better mock test here to check for "Chip already added"
            await expect(subject()).to.be.revertedWith("Subnode already exists");
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

        // describe("when the ERSRegistry state is set incorrectly", async () => {
        //   beforeEach(async () => {
        //     subjectChipAddition.nameHash = calculateSubnodeHash("wrongChip");
        //   });

        //   it("should revert", async () => {
        //     await expect(subject()).to.be.revertedWith("Inconsistent state in ERS");
        //   });
        // });

        // describe("when the custody proof signature is invalid", async () => {
        //   beforeEach(async () => {
        //     subjectDeveloperCustodyProof = await createDeveloperCustodyProof(owner, developerOne.address);
        //   });

        //   it("should revert", async () => {
        //     await expect(subject()).to.be.revertedWith("Invalid custody proof");
        //   });
        // });

        // TODO: check when manufacturerCertificate is invalid.
      });

      // describe("#updateProjectMerkleRoot", async () => {
      //   let subjectProjectRegistrar: Address;
      //   let subjectCaller: Account;

      //   beforeEach(async () => {
      //     subjectProjectRegistrar = fakeProjectRegistrar.address;
      //     subjectCaller = developerOne;
      //   });

      //   describe("when a chip has been claimed", async () => {
      //     beforeEach(async () => {
      //       const chipNameHash = calculateLabelHash("myChip");
      //       await ersRegistry.connect(fakeProjectRegistrar.wallet).createSubnodeRecord(
      //         projectNodeHash,
      //         chipNameHash,
      //         owner.address,
      //         chipOne.address
      //       );

      //       const chipId = chipOne.address;
      //       // const ChipAddition = {
      //       //   developerMerkleInfo: {
      //       //     developerIndex: ZERO,
      //       //     serviceId,
      //       //     lockinPeriod: chipOneClaim.lockinPeriod,
      //       //     tokenUri: claimTokenUri,
      //       //   } as DeveloperMerkleProofInfo,
      //       //   owner: owner.address,
      //       //   rootNode: calculateSubnodeHash("project.mockDeveloper.ers"),
      //       //   nameHash: calculateLabelHash(chipOne.address),
      //       // };

      //       const manufacturerValidation = {
      //         enrollmentId: chipsEnrollmentId,
      //         manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chipOne.address),
      //       };

      //       await chipRegistry.connect(fakeProjectRegistrar.wallet).addChip(
      //         chipId,
      //         owner.address,
      //         manufacturerValidation
      //       );
      //     });

      //     it("should revert", async () => {
      //       await expect(subject()).to.be.revertedWith("Claims have already started");
      //     });
      //   });

      //   describe("when the update time period has elapsed", async () => {
      //     beforeEach(async () => {
      //       await blockchain.increaseTimeAsync(ONE_DAY_IN_SECONDS.mul(31).toNumber());
      //     });

      //     it("should revert", async () => {
      //       await expect(subject()).to.be.revertedWith("Update period has elapsed");
      //     });
      //   });

      //   describe("when the caller is not the project public key", async () => {
      //     beforeEach(async () => {
      //       subjectCaller = owner;
      //     });

      //     it("should revert", async () => {
      //       await expect(subject()).to.be.revertedWith("Caller must be project public key");
      //     });
      //   });
      // });

      context("when a chip is transferred", async () => {
        let chipNode: string;
        let chip: Account;

        let subjectChipIdOne: Address;
        let subjectChipIdTwo: Address;
        let subjectChipOwner: Address;
        let subjectManufacturerValidationOne: ManufacturerValidationInfo;
        let subjectManufacturerValidationTwo: ManufacturerValidationInfo;
        let subjectCaller: Account;

        let subjectProjectRegistrar: Address;
        let subjectProjectPublicKey: Address;
        let subjectTransferPolicy: Address;
        let subjectProjectOwnershipProof: string;
        let subjectNameHash: string;
        let subjectServiceId: string;
        let subjectLockinPeriod: BigNumber;
        let subjectChipAdditionOne: ProjectChipAddition[];
        let subjectChipAdditionTwo: ProjectChipAddition[];

        beforeEach(async () => {
          developerRegistrar = await deployer.getDeveloperRegistrar((await developerRegistry.getDeveloperRegistrars())[0]);

          projectRegistrarTwo = await deployer.deployRedirectProjectRegistrar(
            developerOne.address,
            chipRegistry.address,
            ersRegistry.address,
            developerRegistrar.address
          );

          subjectNameHash = calculateLabelHash("ProjectY");
          subjectProjectRegistrar = projectRegistrarTwo.address;
          subjectProjectPublicKey = developerOne.address;

          subjectServiceId = serviceId;
          subjectLockinPeriod = (await blockchain.getCurrentTimestamp()).add(100);
          subjectProjectOwnershipProof = await createProjectOwnershipProof(
            developerOne, 
            subjectProjectRegistrar, 
            await blockchain.getChainId()
          );
          subjectCaller = developerOne;

          await developerRegistrar.connect(subjectCaller.wallet).addProject(
            subjectNameHash,
            subjectProjectRegistrar,
            subjectProjectPublicKey,
            subjectServiceId, 
            transferPolicy.address,
            subjectLockinPeriod,
            subjectProjectOwnershipProof,
          );

          subjectChipIdOne = chipOne.address;
          subjectManufacturerValidationOne = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chipOne.address),
          };

          subjectChipAdditionOne = [
            {
              chipId: subjectChipIdOne,
              nameHash: calculateLabelHash(subjectChipIdOne),
              manufacturerValidation: subjectManufacturerValidationOne,
            } as ProjectChipAddition,
          ]

          // One the mock, anyone can add a chip to a project.
          await projectRegistrarTwo.connect(subjectCaller.wallet).addChips(subjectChipAdditionOne);

          chip = chipOne;
          chipNode = calculateSubnodeHash(`${chip.address}.ProjectY.gucci.ers`);

          // TODO: add a third project if we want clean state.
        });

        describe("#transferTokenWithChip", async () => {
          let subjectBlockNumberUsedInSig: BigNumber;
          let subjectSignatureFromChip: string;
          let subjectUseSafeTransfer: boolean;
          let subjectCaller: Account;

          beforeEach(async () => {
            const anchorBlock = await blockchain._provider.getBlock("latest");
            subjectBlockNumberUsedInSig = BigNumber.from(anchorBlock.number);
            subjectCaller = newOwner;
            const msgContents = ethers.utils.solidityPack(
              ["address", "bytes32"],
              [subjectCaller.address, anchorBlock.hash]
            );

            subjectSignatureFromChip = await chip.wallet.signMessage(ethers.utils.arrayify(msgContents));
            subjectUseSafeTransfer = false;
          });

          async function subject(): Promise<any> {
            return chipRegistry.connect(subjectCaller.wallet).transferTokenWithChip(
              subjectSignatureFromChip,
              subjectBlockNumberUsedInSig,
              subjectUseSafeTransfer
            );
          }

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Not implemented");
          });
        });

        describe("#transferToken", async() => {
          let subjectChipId: Address;
          let subjectChipOwner: Address;
          let subjectSignatureFromChip: string;
          let subjectBlockNumberUsedInSig: BigNumber;
          let subjectUseSafeTransfer: boolean;
          let subjectPayload: Uint8Array;
          let subjectCaller: Account;

          beforeEach(async () => {
            const anchorBlock = await blockchain._provider.getBlock("latest");
            subjectBlockNumberUsedInSig = BigNumber.from(anchorBlock.number);

            subjectChipId = chip.address;
            subjectCaller = newOwner;
            subjectPayload = ethers.utils.zeroPad(subjectBlockNumberUsedInSig.toHexString(), 32);

            const msgContents = ethers.utils.solidityPack(
              ["address", "bytes32", "bytes"],
              [subjectCaller.address, anchorBlock.hash, subjectPayload]
            );

            subjectSignatureFromChip = await chip.wallet.signMessage(ethers.utils.arrayify(msgContents));
          });

          async function subject(): Promise<any> {
            return await chipRegistry.connect(subjectCaller.wallet).transferToken(
              subjectChipId,
              subjectSignatureFromChip,
              subjectBlockNumberUsedInSig,
              subjectUseSafeTransfer,
              subjectPayload
            );
          }

          it("should transfer the token to the correct address", async () => {
            await subject();

            // Need to use this hacky way to access since the ownerOf function is overloaded
            const actualOwner = (await chipRegistry.functions["ownerOf(address)"](chip.address))[0];
            expect(actualOwner).to.eq(newOwner.address);
          });

          it("should update the owner's balance", async () => {
            const initialOwnerBalance = await chipRegistry.balanceOf(developerOne.address);
            const initialNewOwnerBalance = await chipRegistry.balanceOf(newOwner.address);

            await subject();

            const postOwnerBalance = await chipRegistry.balanceOf(developerOne.address);
            const postNewOwnerBalance = await chipRegistry.balanceOf(newOwner.address);
            expect(postOwnerBalance).to.eq(initialOwnerBalance.sub(ONE));
            expect(postNewOwnerBalance).to.eq(initialNewOwnerBalance.add(ONE));
          });


          it("should call the transfer policy correctly", async () => {
            await subject();

            const callInfo = await transferPolicy.callInfo();
            expect(callInfo.chipId).to.eq(subjectChipId);
            expect(callInfo.sender).to.eq(subjectCaller.address);
            expect(callInfo.chipOwner).to.eq(developerOne.address);
            expect(callInfo.payload).to.eq(ethers.utils.hexZeroPad(subjectBlockNumberUsedInSig.toHexString(), 32));
            expect(callInfo.signature).to.eq(subjectSignatureFromChip);
          });

          it("should emit a Transfer event", async () => {
            const chipTokenId = await chipRegistry.tokenIdFor(chip.address);
            await expect(subject()).to.emit(chipRegistry, "Transfer").withArgs(developerOne.address, newOwner.address, chipTokenId);
          });

          it("should update owner state in the ERSRegistry", async () => {
            await subject();

            const ersOwner = await ersRegistry.getOwner(chipNode);
            expect(ersOwner).to.eq(newOwner.address);
          });
        });

        describe("#setOwner", async () => {
          let subjectChipId: Address;
          let subjectNewOwner: Address;
          let subjectCommitBlock: BigNumber;
          let subjectSignature: string;
          let subjectCaller: Account;

          beforeEach(async () => {
            subjectChipId = chip.address;
            subjectNewOwner = newOwner.address;
            subjectCommitBlock = await blockchain.getLatestBlockNumber();

            const packedMsg = ethers.utils.solidityPack(
              ["uint256", "address"],
              [subjectCommitBlock, subjectNewOwner]
            );
            subjectSignature = await chip.wallet.signMessage(ethers.utils.arrayify(packedMsg));
            subjectCaller = developerOne;
          });

          async function subject(): Promise<any> {
            return chipRegistry.connect(subjectCaller.wallet).setOwner(
              subjectChipId,
              subjectNewOwner,
              subjectCommitBlock,
              subjectSignature
            );
          }

          it("should set the new owner", async () => {
            await subject();

            // Need to use this hacky way to access since the ownerOf function is overloaded
            const chipOwner = (await chipRegistry.functions["ownerOf(address)"](subjectChipId))[0];
            expect(chipOwner).to.eq(subjectNewOwner);
          });

          it("should update owner state in the ERSRegistry", async () => {
            await subject();

            const ersOwner = await ersRegistry.getOwner(chipNode);
            expect(ersOwner).to.eq(subjectNewOwner);
          });

          it("should emit a Transfer event", async () => {
            await expect(subject()).to.emit(chipRegistry, "Transfer").withArgs(
              developerOne.address,
              subjectNewOwner,
              (await chipRegistry.tokenIdFor(subjectChipId))
            );
          });

          describe("when the signature isn't valid", async () => {
            beforeEach(async () => {
              const packedMsg = ethers.utils.solidityPack(["uint256"], [subjectCommitBlock]);
              subjectSignature = await chipThree.wallet.signMessage(packedMsg);
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Invalid signature");
            });
          });

          describe("when the signature has expired", async () => {
            beforeEach(async () => {
              await blockchain.waitBlocksAsync(6);
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Signature expired");
            });
          });

          describe("when the owner isn't the caller", async () => {
            beforeEach(async () => {
              subjectCaller = chip;
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Caller must be chip owner");
            });
          });
        });

        describe("#tokenURI(uint256)", async () => {
          let subjectTokenId: BigNumber;

          beforeEach(async () => {
            subjectTokenId = await chipRegistry.tokenIdFor(chip.address);
          });

          async function subject(): Promise<any> {
            return (await chipRegistry.functions["tokenURI(uint256)"](subjectTokenId))[0];
          }

          it("should return the primary service's tokenUri content", async () => {
            const tokenURI = await subject();

            expect(tokenURI).to.eq(baseTokenUri.concat(BigNumber.from(chipNode).toString()));
          });

          describe("when the service doesn't have a tokenURI", async () => {
            beforeEach(async () => {
              await servicesRegistry.removeServiceRecords(
                serviceId,
                [ethers.utils.formatBytes32String("tokenUri")]
              );
            });

            it("should return the correct token URI", async () => {
              const tokenURI = await subject();
              expect(tokenURI).to.eq(baseTokenUri.concat(BigNumber.from(chipNode).toString()));
            });
          });

          describe("when the token ID is invalid", async () => {
            beforeEach(async () => {
              subjectTokenId = (await blockchain.getCurrentTimestamp()).add(100);
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("ERC721: invalid token ID");
            });
          });
        });

        describe("#tokenURI(address)", async () => {
          let subjectChipId: Address;

          beforeEach(async () => {
            subjectChipId = chip.address;
          });

          async function subject(): Promise<any> {
            return (await chipRegistry.functions["tokenURI(address)"](subjectChipId))[0];
          }

          it("should return the primary service's tokenUri content", async () => {
            const tokenURI = await subject();

            expect(tokenURI).to.eq("api.gucci.com/tokens/1/".concat(subjectChipId.toString().toLowerCase()));
          });

          describe("when the service doesn't have a tokenURI", async () => {
            beforeEach(async () => {
              await servicesRegistry.removeServiceRecords(
                serviceId,
                [ethers.utils.formatBytes32String("tokenUri")]
              );
            });

            it("should return the correct token URI", async () => {
              const tokenURI = await subject();
              expect(tokenURI).to.eq(baseTokenUri.concat(BigNumber.from(chipNode).toString()));
            });
          });

          describe("when the token ID is invalid", async () => {
            beforeEach(async () => {
              subjectChipId = owner.address;
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Chip must be minted");
            });
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
