import "module-alias/register";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  Address,
  ChipAdditionInfo,
  ManufacturerValidationInfo,
  ServiceRecord,
  DeveloperClaimTreeInfo,
  DeveloperMerkleProofInfo
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
  DeveloperRegistryMock
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

describe("ChipRegistry", () => {
  let owner: Account;
  let developerOne: Account;
  let developerTwo: Account;
  let manufacturerOne: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let newOwner: Account;

  let manufacturerRegistry: ManufacturerRegistry;
  let ersRegistry: ERSRegistry;
  let developerRegistrarFactory: DeveloperRegistrarFactory;
  let developerRegistry: DeveloperRegistryMock;
  let servicesRegistry: ServicesRegistry;
  let chipRegistry: ChipRegistry;
  let transferPolicy: TransferPolicyMock;
  let fakeProjectRegistrar: Account;

  let manufacturerId: string;
  let maxBlockWindow: BigNumber;
  let baseTokenUri: string;
  let serviceId: string;
  let serviceRecords: ServiceRecord[];
  let manufacturerMerkleTree: ManufacturerTree;
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
      newOwner,
      fakeProjectRegistrar,
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

    developerRegistry = await deployer.mocks.deployDeveloperRegistryMock(owner.address);
    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
    servicesRegistry = await deployer.deployServicesRegistry(chipRegistry.address);

    await ersRegistry.connect(owner.wallet).createSubnodeRecord(NULL_NODE, calculateLabelHash("ers"), developerRegistry.address, developerRegistry.address);

    manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
    await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

    developerRegistrarFactory = await deployer.deployDeveloperRegistrarFactory(
      chipRegistry.address,
      ersRegistry.address,
      developerRegistry.address
    );

    await developerRegistry.initialize(ersRegistry.address, [developerRegistrarFactory.address], owner.address);

    transferPolicy = await deployer.mocks.deployTransferPolicyMock();

    // create manufacturer merkle tree and enroll chips
    manufacturerMerkleTree = new ManufacturerTree(
      [{chipId: chipOne.address}, {chipId: chipTwo.address}]
    );

    await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
      manufacturerId,
      manufacturerOne.address,
      manufacturerOne.address,      // Placeholder
      "ipfs://QmQmQmQmQmQmQmQmQmQmQmQmQmQmQm",
      "https://bootloader.app",
      "SuperCool ChipModel"
    );

    chipsEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);
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
    let mockRegistrarErsNode: string;

    beforeEach(async () => {
      await chipRegistry.initialize(ersRegistry.address, servicesRegistry.address, developerRegistry.address);

      const mockNameHash = calculateLabelHash("mockDeveloper");
      await developerRegistry.addAllowedDeveloper(developerOne.address, mockNameHash);

      mockRegistrarErsNode = calculateSubnodeHash("mockDeveloper.ers");
      await developerRegistry.addMockRegistrar(owner.address, mockNameHash);
    });

    describe("#addProjectEnrollment", async () => {
      let subjectProjectRegistrar: Address;
      let subjectProjectPublicKey: Address;
      let subjectTransferPolicy: Address;
      let subjectMerkleRoot: string;
      let subjectProjectOwnershipProof: string;
      let subjectProjectClaimDataUri: string;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectProjectRegistrar = fakeProjectRegistrar.address;
        subjectProjectPublicKey = developerOne.address;
        subjectTransferPolicy = developerOne.address;
        subjectProjectOwnershipProof = await createProjectOwnershipProof(developerOne, subjectProjectRegistrar, chainId);
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return chipRegistry.connect(subjectCaller.wallet).addProjectEnrollment(
          subjectProjectRegistrar,
          subjectProjectPublicKey,
          subjectTransferPolicy,
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
          subjectCaller.address,
          subjectProjectRegistrar,
          subjectTransferPolicy,
          subjectProjectPublicKey,
        );
      });

      describe("when the caller is not a Developer Registrar", async () => {
        beforeEach(async () => {
          subjectCaller = developerOne;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Must be Developer Registrar");
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

      let chipOneClaim: DeveloperClaimTreeInfo;
      let chipTwoClaim: DeveloperClaimTreeInfo;
      let developerMerkleTree: DeveloperTree;
      let claimTokenUri: string;
      let projectOwnershipSignature: string;

      before(async () => {
        claimTokenUri = "https://tokenuri.com";

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

        await servicesRegistry.createService(serviceId, serviceRecords);

        // create developer merkle tree and enroll chips
        chipOneClaim = {
          chipId: chipOne.address,
          enrollmentId: chipsEnrollmentId,
          lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
          primaryServiceId: serviceId,
          tokenUri: claimTokenUri,
        };

        chipTwoClaim = {
          chipId: chipTwo.address,
          enrollmentId: chipsEnrollmentId,
          lockinPeriod: (await blockchain.getCurrentTimestamp()).add(100),
          primaryServiceId: serviceId,
          tokenUri: claimTokenUri,
        };
      });

      beforeEach(async () => {
        developerMerkleTree = new DeveloperTree([chipOneClaim, chipTwoClaim]);

        projectWallet = developerOne;
        projectOwnershipSignature = await createProjectOwnershipProof(
          projectWallet,
          fakeProjectRegistrar.address,
          chainId
        );

        const projectNameHash = calculateLabelHash("project");
        await ersRegistry.connect(owner.wallet).createSubnodeRecord(
          mockRegistrarErsNode,
          projectNameHash,
          fakeProjectRegistrar.address,
          fakeProjectRegistrar.address
        );
        projectNodeHash = calculateSubnodeHash("project.mockDeveloper.ers");

        await chipRegistry.addProjectEnrollment(
          fakeProjectRegistrar.address,
          developerOne.address,
          transferPolicy.address,
          projectOwnershipSignature,
        );
      });

      describe.only("#claimChip", async () => {
        let subjectChipId: Address;
        let subjectChipAddition: ChipAdditionInfo;
        let subjectManufacturerValidation: ManufacturerValidationInfo;
        let subjectCaller: Account;

        let chipNameHash: string;

        beforeEach(async () => {
          chipNameHash = calculateLabelHash("myChip");
          await ersRegistry.connect(fakeProjectRegistrar.wallet).createSubnodeRecord(
            projectNodeHash,
            chipNameHash,
            owner.address,
            chipOne.address
          );

          await chipRegistry.initialize(ersRegistry.address, servicesRegistry.address, developerRegistry.address);

          const mockNameHash = calculateLabelHash("mockDeveloper");
          await developerRegistry.addAllowedDeveloper(developerOne.address, mockNameHash);
    
          mockRegistrarErsNode = calculateSubnodeHash("mockDeveloper.ers");
          await developerRegistry.addMockRegistrar(owner.address, mockNameHash);

          subjectChipId = chipOne.address;
          subjectChipAddition = {
            developerMerkleInfo: {
              developerIndex: ZERO,
              serviceId,
              lockinPeriod: chipOneClaim.lockinPeriod,
              tokenUri: claimTokenUri,
            } as DeveloperMerkleProofInfo,
            owner: owner.address,
            rootNode: calculateSubnodeHash("project.mockDeveloper.ers"),
            nameHash: calculateLabelHash(chipOne.address),
          };

          subjectManufacturerValidation = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chipOne.address),
          };

          subjectCaller = fakeProjectRegistrar;
        });

        async function subject(): Promise<any> {
          return chipRegistry.connect(fakeProjectRegistrar.wallet).addChip(
            subjectChipId,
            subjectChipAddition,
            subjectManufacturerValidation,
          );
        }

        it("should claim the chip and set chip table state", async () => {
          await subject();

          const actualChipTransferPolicy = await chipRegistry.chipTransferPolicy(chipOne.address);

          // const expectedTokenData = createTokenData(subjectChipAddition.ersNode, subjectManufacturerValidation.enrollmentId);
          // console.log("expectedTokenData", expectedTokenData)
          // console.log("actualChipInfo", actualChipInfo)
          // expect(actualChipInfo.tokenData).to.eq(expectedTokenData);
          // expect(actualChipInfo.tokenId).to.eq(subjectChipId);
          expect(actualChipTransferPolicy).to.eq(transferPolicy.address);
          // expect(actualChipInfo.tokenUri).to.eq(subjectChipAddition.developerMerkleInfo.tokenUri);
        });

        it("should set the chip owner and update owner balances", async () => {
          await subject();

          const actualChipOwner = (await chipRegistry.functions["ownerOf(address)"](subjectChipId))[0];
          const actualOwnerBalance = await chipRegistry.balanceOf(subjectChipAddition.owner);
          expect(actualChipOwner).to.eq(subjectChipAddition.owner);
          expect(actualOwnerBalance).to.eq(subjectChipId);
        });

        // it("should map the token id to the chip id", async () => {
        //   await subject();

        //   const actualChipId = await chipRegistry.tokenIdToChipId(subjectChipId);
        //   expect(actualChipId).to.eq(subjectChipId);
        // });

        // it("should increment the token id counter", async () => {
        //   const initialTokenIdCounter = await chipRegistry.tokenIdCounter();

        //   await subject();

        //   const newTokenIdCounter = await chipRegistry.tokenIdCounter();
        //   expect(newTokenIdCounter).to.eq(initialTokenIdCounter.add(subjectChipId));
        // });

        it("should set the project's claimsStarted field to true", async () => {
          const preProjectInfo = await chipRegistry.projectEnrollments(fakeProjectRegistrar.address);
          expect(preProjectInfo.claimsStarted).to.be.false;

          await subject();

          const postProjectInfo = await chipRegistry.projectEnrollments(fakeProjectRegistrar.address);
          expect(postProjectInfo.claimsStarted).to.be.true;
        });

        it("should update state on the ServicesRegistry", async () => {
          await subject();

          const chipServices = await servicesRegistry.chipServices(subjectChipId);

          expect(chipServices.primaryService).to.eq(subjectChipAddition.developerMerkleInfo.serviceId);
          expect(chipServices.serviceTimelock).to.eq(subjectChipAddition.developerMerkleInfo.lockinPeriod);
        });

        it("should emit a ChipAdded event", async () => {
          await expect(subject()).to.emit(chipRegistry, "ChipAdded").withArgs(
            subjectChipId,
            subjectChipAddition.owner,
            subjectChipAddition.developerMerkleInfo.serviceId,
            calculateSubnodeHash(`${subjectChipId}.project.mockDeveloper.ers`),
            subjectManufacturerValidation.enrollmentId
          );
        });

        describe("when the timelock period exceeds the max set by governance", async () => {
          let newMaxTimelock: BigNumber;

          beforeEach(async () => {
            newMaxTimelock = BigNumber.from(50);
            await chipRegistry.updateMaxLockinPeriod(newMaxTimelock);
          });

          it("should set the primary service timelock to project creation timestamp + max", async () => {
            const creationTimestamp = (await chipRegistry.projectEnrollments(fakeProjectRegistrar.address)).creationTimestamp;

            await subject();

            const chipServices = await servicesRegistry.chipServices(subjectChipId);

            expect(chipServices.serviceTimelock).to.eq(creationTimestamp.add(newMaxTimelock));
          });
        });

        describe("when a second chip is being claimed from a project", async () => {
          beforeEach(async () => {
            await subject();

            chipNameHash = calculateLabelHash("myChip2");
            await ersRegistry.connect(fakeProjectRegistrar.wallet).createSubnodeRecord(
              projectNodeHash,
              chipNameHash,
              owner.address,
              chipTwo.address
            );

            subjectChipId = chipTwo.address;
            subjectChipAddition = {
              developerMerkleInfo: {
                developerIndex: ONE,
                serviceId,
                lockinPeriod: chipTwoClaim.lockinPeriod,
                tokenUri: claimTokenUri,
                developerProof: developerMerkleTree.getProof(1),
              } as DeveloperMerkleProofInfo,
              owner: owner.address,
              rootNode: calculateSubnodeHash("project.mockDeveloper.ers"),
              nameHash: calculateLabelHash(chipTwo.address),
            };

            subjectManufacturerValidation = {
              enrollmentId: chipsEnrollmentId,
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chipTwo.address),
            };
            subjectCaller = fakeProjectRegistrar;
          });

          it("should claim the chip", async () => {
            await subject();

            const actualChipTransferPolicy = await chipRegistry.chipTransferPolicy(chipTwo.address);

            // const expectedTokenData = createTokenData(subjectChipAddition.ersNode, subjectManufacturerValidation.enrollmentId);
            // expect(actualChipInfo.tokenData).to.eq(expectedTokenData);
            // expect(actualChipInfo.tokenId).to.eq(BigNumber.from(2));
            expect(actualChipTransferPolicy).to.eq(transferPolicy.address);
            // expect(actualChipInfo.tokenUri).to.eq(subjectChipAddition.developerMerkleInfo.tokenUri);
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
            subjectChipAddition.owner = ADDRESS_ZERO;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Invalid chip owner");
          });
        });

        describe("when the project has not been enrolled", async () => {
          beforeEach(async () => {
            subjectCaller = developerOne;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Project not enrolled");
          });
        });

        describe("when the ERSRegistry state is set incorrectly", async () => {
          beforeEach(async () => {
            subjectChipAddition.nameHash = calculateSubnodeHash("wrongChip");
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Inconsistent state in ERS");
          });
        });

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

      describe("#updateProjectMerkleRoot", async () => {
        let subjectProjectRegistrar: Address;
        let subjectCaller: Account;

        beforeEach(async () => {
          subjectProjectRegistrar = fakeProjectRegistrar.address;
          subjectCaller = developerOne;
        });

        describe("when a chip has been claimed", async () => {
          beforeEach(async () => {
            const chipNameHash = calculateLabelHash("myChip");
            await ersRegistry.connect(fakeProjectRegistrar.wallet).createSubnodeRecord(
              projectNodeHash,
              chipNameHash,
              owner.address,
              chipOne.address
            );

            const chipId = chipOne.address;
            const ChipAddition = {
              developerMerkleInfo: {
                developerIndex: ZERO,
                serviceId,
                lockinPeriod: chipOneClaim.lockinPeriod,
                tokenUri: claimTokenUri,
              } as DeveloperMerkleProofInfo,
              owner: owner.address,
              rootNode: calculateSubnodeHash("project.mockDeveloper.ers"),
              nameHash: calculateLabelHash(chipOne.address),
            };

            const manufacturerValidation = {
              enrollmentId: chipsEnrollmentId,
              manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chipOne.address),
            };

            await chipRegistry.connect(fakeProjectRegistrar.wallet).addChip(
              chipId,
              ChipAddition,
              manufacturerValidation
            );
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Claims have already started");
          });
        });

        describe("when the update time period has elapsed", async () => {
          beforeEach(async () => {
            await blockchain.increaseTimeAsync(ONE_DAY_IN_SECONDS.mul(31).toNumber());
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Update period has elapsed");
          });
        });

        describe("when the caller is not the project public key", async () => {
          beforeEach(async () => {
            subjectCaller = owner;
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("Caller must be project public key");
          });
        });
      });

      context("when a chip has been claimed", async () => {
        let developerRegistrar: DeveloperRegistrar;

        let projectRegistrar: ProjectRegistrarMock;
        let chipNameHash: string;
        let chipNode: string;
        let chip: Account;

        beforeEach(async () => {
          // Deploy ProjectRegistrar
          projectRegistrar = await deployer.mocks.deployProjectRegistrarMock(
            chipRegistry.address,
            ersRegistry.address
          );

          // Create new DeveloperRegistrar
          const nameHash = calculateLabelHash("developerTwo");
          await developerRegistry.addAllowedDeveloper(developerTwo.address, nameHash);
          await developerRegistry.connect(developerTwo.wallet).createNewDeveloperRegistrar(developerRegistrarFactory.address);
          const registrarErsNode = calculateSubnodeHash("developerTwo.ers");

          const developerRegistrarAddress = await ersRegistry.getResolver(registrarErsNode);
          developerRegistrar = await deployer.getDeveloperRegistrar(developerRegistrarAddress);
          
          // Add Project via DeveloperRegistrar
          const signature = await createProjectOwnershipProof(developerTwo, projectRegistrar.address, chainId);
          const projectNameHash = calculateLabelHash("ProjectFlex");
          await developerRegistrar.connect(developerTwo.wallet).addProject(
            projectNameHash,
            projectRegistrar.address,
            developerTwo.address,
            transferPolicy.address,
            signature,
          );

          chipNameHash = calculateLabelHash("myChip");
          chip = chipOne;
          chipNode = calculateSubnodeHash("myChip.ProjectFlex.developerTwo.ers");

          const ChipAddition: DeveloperMerkleProofInfo = {
            developerIndex: ZERO,
            serviceId,
            lockinPeriod: chipOneClaim.lockinPeriod,
            tokenUri: claimTokenUri,
          };

          const manufacturerValidation = {
            enrollmentId: chipsEnrollmentId,
            manufacturerCertificate: await createManufacturerCertificate(manufacturerOne, chip.address),
          };

          const developerInclusionProof = await createDeveloperInclusionProof(developerTwo, chipOne.address);
          const developerCustodyProof = await createDeveloperCustodyProof(chipOne, developerTwo.address);

          await projectRegistrar.connect(chip.wallet).claimChip(
            chipNameHash,
            owner.address,
            ChipAddition,
            manufacturerValidation,
          );
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
            const initialOwnerBalance = await chipRegistry.balanceOf(owner.address);
            const initialNewOwnerBalance = await chipRegistry.balanceOf(newOwner.address);

            await subject();

            const postOwnerBalance = await chipRegistry.balanceOf(owner.address);
            const postNewOwnerBalance = await chipRegistry.balanceOf(newOwner.address);
            expect(postOwnerBalance).to.eq(initialOwnerBalance.sub(ONE));
            expect(postNewOwnerBalance).to.eq(initialNewOwnerBalance.add(ONE));
          });


          it("should call the transfer policy correctly", async () => {
            await subject();

            const callInfo = await transferPolicy.callInfo();
            expect(callInfo.chipId).to.eq(subjectChipId);
            expect(callInfo.sender).to.eq(subjectCaller.address);
            expect(callInfo.chipOwner).to.eq(owner.address);
            expect(callInfo.payload).to.eq(ethers.utils.hexZeroPad(subjectBlockNumberUsedInSig.toHexString(), 32));
            expect(callInfo.signature).to.eq(subjectSignatureFromChip);
          });

          it("should emit a Transfer event", async () => {
            const chipTokenId = await chipRegistry.tokenIdFor(chip.address);
            await expect(subject()).to.emit(chipRegistry, "Transfer").withArgs(owner.address, newOwner.address, chipTokenId);
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
            subjectCaller = owner;
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
              owner.address,
              subjectNewOwner,
              (await chipRegistry.tokenIdFor(subjectChipId))
            );
          });

          describe("when the signature isn't valid", async () => {
            beforeEach(async () => {
              const packedMsg = ethers.utils.solidityPack(["uint256"], [subjectCommitBlock]);
              subjectSignature = await chipTwo.wallet.signMessage(packedMsg);
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

            expect(tokenURI).to.eq("api.gucci.com/tokens/1/".concat(chip.address.toString().toLowerCase()));
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
              expect(tokenURI).to.eq(claimTokenUri);
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
              expect(tokenURI).to.eq(claimTokenUri);
            });
          });

          describe("when the token ID is invalid", async () => {
            beforeEach(async () => {
              subjectChipId = owner.address;
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Chip must be claimed");
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
